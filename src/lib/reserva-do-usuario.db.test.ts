// Teste de banco: Postgres descartável, como src/lib/aprovacao-vendedor-da-conta.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
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
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let reservaDoUsuario: typeof import('@/lib/reserva-do-usuario')['reservaDoUsuario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ reservaDoUsuario } = await import('@/lib/reserva-do-usuario'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'RS404 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'RS404 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja RS404 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vendedor] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vendedor', ${'vend-rs404' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${'RS404 ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${'RS404-' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'montada', 'reservada') returning id`)
  const [reserva] = await linhas(tx, sql`insert into reservas (moto_id, loja_id, vendedor_id, valor_reserva, meio_pagamento, data_prevista_finalizacao, status)
    values (${moto.id}, ${loja.id}, ${vendedor.id}, 500, 'pix', current_date, 'cancelada') returning id`)
  return {
    reservaId: reserva.id as string,
    aux: { papel: 'aux_adm', contaId: conta.id as string },
    socio: { papel: 'admin_socio', contaId: conta.id as string },
  }
}

test('a própria Conta (aux e sócio) acha a reserva', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040441')
    for (const usuario of [a.aux, a.socio]) {
      assert.equal((await reservaDoUsuario(usuario, a.reservaId, tx))?.status, 'cancelada')
    }
  })
})

test('Conta B (aux e sócio) não acha a reserva da Conta A, nem o status dela, igual a um id inexistente (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040442')
    const b = await semearConta(tx, 'B', '00000000040443')
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await reservaDoUsuario(usuario, a.reservaId, tx), null)
      assert.equal(await reservaDoUsuario(usuario, crypto.randomUUID(), tx), null)
    }
  })
})
