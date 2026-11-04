// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Encerrar a garantia devolve a moto ao estado certo. O status 'disponivel' que a função
// gravava não é status físico, e o estoque mostrava a moto como "Caixa".
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']

before(async () => {
  ;({ db } = await import('@/lib/db'))
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

type Cenario = { base: Base; adminId: string; auxId: string }

async function cenario(tx: Tx): Promise<Cenario> {
  const base = await semearContaBase(tx, { prefixo: 'GBX', nome: 'A', cnpj: '11222333000181' })
  const adminId = await semearUsuario(tx, base, { papel: 'admin_geral', semLoja: true })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm' })
  return { base, adminId, auxId }
}

async function novaMoto(tx: Tx, c: Cenario, opcoes: { disponibilidade?: string | null; somenteGarantia?: boolean } = {}) {
  const chassi = 'GBX' + Math.floor(Math.random() * 1e12)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'GBX ' + chassi}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const disp = opcoes.disponibilidade ?? null
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade, somente_garantia)
    values (${chassi}, ${modelo.id}, ${c.base.lojaId}, 'AZUL', '1', 'em_garantia', ${disp}::disponibilidade_moto, ${opcoes.somenteGarantia ?? false}) returning id`)
  return moto.id as string
}

async function garantia(tx: Tx, c: Cenario, motoId: string, dataFim = '2099-01-01') {
  const [g] = await linhas(tx, sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim, status)
    values (${motoId}, ${c.base.lojaId}, 'Teste', '2020-01-01', ${dataFim}, 'ativa') returning id`)
  return g.id as string
}

async function vender(tx: Tx, c: Cenario, motoId: string) {
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${motoId}, ${c.base.lojaId}, ${c.auxId}, 'efetivado') returning id`)
  await tx.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${motoId}, ${c.base.lojaId}, ${c.auxId}, ${c.auxId}, 'Cliente', '52998224725', 1000, 'pix')`)
}

const encerrar = (tx: Tx, c: Cenario, garantiaId: string) =>
  tx.execute(sql`select encerrar_garantia(${garantiaId}::uuid, ${c.auxId}::uuid, 'aux_adm', ${c.base.lojaId}::uuid, 'pronta'::text, null::date)`)

const estado = async (tx: Tx, motoId: string) =>
  (await linhas(tx, sql`select status::text, disponibilidade::text from motos where id = ${motoId}`))[0]

const historico = (tx: Tx, motoId: string) =>
  linhas(tx, sql`select status_anterior::text, status_novo::text, observacao from historico_estoque where moto_id = ${motoId} order by data`)

test('moto sem venda volta para montada e disponível, mesmo com disponibilidade nula', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    for (const disponibilidade of [null, 'disponivel']) {
      const moto = await novaMoto(tx, c, { disponibilidade })
      await encerrar(tx, c, await garantia(tx, c, moto))
      assert.deepEqual(await estado(tx, moto), { status: 'montada', disponibilidade: 'disponivel' })
      assert.deepEqual(await historico(tx, moto), [{ status_anterior: 'em_garantia', status_novo: 'montada', observacao: 'pronta' }])
    }
  })
})

test('moto vendida volta para vendida e não entra no estoque', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    const moto = await novaMoto(tx, c, { disponibilidade: 'vendida' })
    await vender(tx, c, moto)
    await encerrar(tx, c, await garantia(tx, c, moto))
    assert.deepEqual(await estado(tx, moto), { status: 'vendida', disponibilidade: 'vendida' })

    // Venda ainda sem NF: a disponibilidade segue nula, como ao fechar a venda.
    const semNf = await novaMoto(tx, c)
    await vender(tx, c, semNf)
    await encerrar(tx, c, await garantia(tx, c, semNf))
    assert.deepEqual(await estado(tx, semNf), { status: 'vendida', disponibilidade: null })
  })
})

test('reserva, aprovação e "marcada como vendida" não viram disponível', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    for (const disponibilidade of ['reservada', 'aguardando_aprovacao', 'vendida']) {
      const moto = await novaMoto(tx, c, { disponibilidade })
      await encerrar(tx, c, await garantia(tx, c, moto))
      assert.deepEqual(await estado(tx, moto), { status: 'montada', disponibilidade })
    }
  })
})

test('veículo só de garantia nunca vira estoque', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    const moto = await novaMoto(tx, c, { somenteGarantia: true })
    await encerrar(tx, c, await garantia(tx, c, moto))
    assert.deepEqual(await estado(tx, moto), { status: 'montada', disponibilidade: null })
  })
})

test('com outra garantia ativa, a moto segue em garantia até a última', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    const moto = await novaMoto(tx, c, { disponibilidade: 'disponivel' })
    const g1 = await garantia(tx, c, moto)
    const g2 = await garantia(tx, c, moto)
    await encerrar(tx, c, g1)
    assert.equal((await estado(tx, moto)).status, 'em_garantia')
    await encerrar(tx, c, g2)
    assert.deepEqual(await estado(tx, moto), { status: 'montada', disponibilidade: 'disponivel' })
  })
})

test('expirar por data: mesma regra, e só registra histórico quando a moto muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    const livre = await novaMoto(tx, c)
    await garantia(tx, c, livre, '2020-06-01')
    const vendida = await novaMoto(tx, c, { disponibilidade: 'vendida' })
    await vender(tx, c, vendida)
    await garantia(tx, c, vendida, '2020-06-01')
    const comOutra = await novaMoto(tx, c, { disponibilidade: 'disponivel' })
    await garantia(tx, c, comOutra, '2020-06-01')
    await garantia(tx, c, comOutra)

    await tx.execute(sql`select expirar_garantias()`)

    assert.deepEqual(await estado(tx, livre), { status: 'montada', disponibilidade: 'disponivel' })
    assert.deepEqual((await historico(tx, livre)).map(h => h.status_novo), ['montada'])
    assert.deepEqual(await estado(tx, vendida), { status: 'vendida', disponibilidade: 'vendida' })
    assert.deepEqual((await historico(tx, vendida)).map(h => h.status_novo), ['vendida'])
    assert.equal((await estado(tx, comOutra)).status, 'em_garantia')
    assert.deepEqual(await historico(tx, comOutra), [])
  })
})
