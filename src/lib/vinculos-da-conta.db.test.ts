// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Mod = typeof import('@/lib/vinculos-da-conta')
let db: Db['db']
let conferirVinculosDaConta: Mod['conferirVinculosDaConta']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ conferirVinculosDaConta } = await import('@/lib/vinculos-da-conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

type Ids = { loja: string; moto: string; cliente: string; mecanico: string; socio: string; os: string }

// Cada caso monta duas Contas numa transação e a desfaz no fim.
async function comDuasContas(caso: (ids: Record<'A' | 'B', Ids>, tx: Parameters<Parameters<Db['db']['transaction']>[0]>[0]) => Promise<void>) {
  class Desfazer extends Error {}
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'V328', 'autopropelido', '1000', 'hub', '32') returning id`)
    const ids = {} as Record<'A' | 'B', Ids>
    for (const [nome, cnpj] of [['A', '00000000032821'], ['B', '00000000032822']] as const) {
      const conta = await linha(sql`insert into contas (nome) values (${'Vinculo 328 ' + nome}) returning id`)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Vinculo 328 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja V328 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
      const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
        values (${'VINC328' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'disponivel', 'disponivel') returning id`)
      const cliente = await linha(sql`insert into clientes (nome, conta_id) values (${'Cliente ' + nome}, ${conta.id}) returning id`)
      const mecanico = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), ${'Mec ' + nome}, ${'mec' + nome + '@v328.invalid'}, 'mecanico', ${loja.id}) returning id`)
      const socio = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), ${'Socio ' + nome}, ${'socio' + nome + '@v328.invalid'}, 'admin_socio', ${conta.id}) returning id`)
      const os = await linha(sql`insert into ordens_servico (loja_id, aberta_por, descricao) values (${loja.id}, ${socio.id}, 'OS V328') returning id`)
      ids[nome] = { loja: loja.id, moto: moto.id, cliente: cliente.id, mecanico: mecanico.id, socio: socio.id, os: os.id }
    }
    await caso(ids, tx)
    throw new Desfazer()
  }), (e: unknown) => e instanceof Error && e.constructor.name === 'Desfazer')
}

test('vínculos da própria Conta passam, e vazios são ignorados (#328)', () => comDuasContas(async (ids, tx) => {
  const b = ids.B
  await conferirVinculosDaConta(b.loja, { lojaId: b.loja, motoId: b.moto, clienteId: b.cliente, osId: b.os, mecanicoId: b.mecanico }, tx)
  await conferirVinculosDaConta(b.loja, { mecanicoId: b.socio }, tx)
  await conferirVinculosDaConta(b.loja, { motoId: null, clienteId: undefined, osId: null, mecanicoId: null }, tx)
}))

test('loja da Conta A não serve para a Conta B (#328)', () => comDuasContas(async (ids, tx) => {
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { lojaId: ids.A.loja }, tx), /Loja não encontrada/)
}))

test('moto da Conta A não serve para a Conta B (#328)', () => comDuasContas(async (ids, tx) => {
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { motoId: ids.A.moto }, tx), /Moto não encontrada/)
}))

test('cliente da Conta A não serve para a Conta B (#328)', () => comDuasContas(async (ids, tx) => {
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { clienteId: ids.A.cliente }, tx), /Cliente não encontrado/)
}))

test('OS da Conta A não serve para a Conta B (#328)', () => comDuasContas(async (ids, tx) => {
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { osId: ids.A.os }, tx), /OS não encontrada/)
}))

test('funcionário e sócio da Conta A não servem de mecânico na Conta B (#328)', () => comDuasContas(async (ids, tx) => {
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { mecanicoId: ids.A.mecanico }, tx), /Mecânico não encontrado/)
  await assert.rejects(conferirVinculosDaConta(ids.B.loja, { mecanicoId: ids.A.socio }, tx), /Mecânico não encontrado/)
}))
