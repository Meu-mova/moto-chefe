// Teste de banco: Postgres descartável, como src/lib/venda-do-usuario.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { eq, sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let notaSaidaDoUsuario: typeof import('@/lib/nota-saida-do-usuario')['notaSaidaDoUsuario']
let vendaDoUsuario: typeof import('@/lib/venda-do-usuario')['vendaDoUsuario']
let vendaDoUsuarioParaNf: typeof import('@/lib/venda-do-usuario')['vendaDoUsuarioParaNf']
let vendas: typeof import('@/lib/db/schema')['vendas']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ notaSaidaDoUsuario } = await import('@/lib/nota-saida-do-usuario'))
  ;({ vendaDoUsuario, vendaDoUsuarioParaNf } = await import('@/lib/venda-do-usuario'))
  ;({ vendas } = await import('@/lib/db/schema'))
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'NS404 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'NS404 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja NS404 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-ns404' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${'NS404 ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${'NS404-' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${moto.id}, ${loja.id}, ${aux.id}, 'efetivado') returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${loja.id}, ${aux.id}, ${aux.id}, 'Cliente', '52998224725', 1000, 'pix') returning id`)
  const [nota] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, status, numero, serie, payload)
    values (${venda.id}, ${grupo.id}, ${'NS404-' + nome}, 'Homologacao', 'Autorizada', '1', '1', '{}'::jsonb) returning id`)
  return {
    notaId: nota.id as string,
    grupoId: grupo.id as string,
    vendaId: venda.id as string,
    aux: { papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [grupo.id as string], contaId: conta.id as string },
  }
}

test('a própria Conta (aux e sócio) acha a NF de saída', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040461')
    for (const usuario of [a.aux, a.socio]) {
      assert.equal((await notaSaidaDoUsuario(usuario, a.notaId, tx))?.id, a.notaId)
    }
  })
})

test('Conta B (aux e sócio) não acha a NF de saída da Conta A, igual a um id inexistente (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040462')
    const b = await semearConta(tx, 'B', '00000000040463')
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await notaSaidaDoUsuario(usuario, a.notaId, tx), null)
      assert.equal(await notaSaidaDoUsuario(usuario, crypto.randomUUID(), tx), null)
    }
  })
})

test('grupo inativo: sócio e aux da Conta seguem achando venda e nota nas rotas de NF; a Conta B não (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040464')
    const b = await semearConta(tx, 'B', '00000000040465')
    await linhas(tx, sql`update grupos set ativo = false where id = ${a.grupoId}`)
    for (const usuario of [a.aux, a.socio]) {
      assert.equal(await vendaDoUsuario(usuario, eq(vendas.id, a.vendaId), tx), null)
      assert.equal((await vendaDoUsuarioParaNf(usuario, eq(vendas.id, a.vendaId), tx))?.id, a.vendaId)
      assert.equal((await notaSaidaDoUsuario(usuario, a.notaId, tx))?.id, a.notaId)
    }
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await vendaDoUsuarioParaNf(usuario, eq(vendas.id, a.vendaId), tx), null)
      assert.equal(await vendaDoUsuarioParaNf(usuario, eq(vendas.id, crypto.randomUUID()), tx), null)
    }
  })
})
