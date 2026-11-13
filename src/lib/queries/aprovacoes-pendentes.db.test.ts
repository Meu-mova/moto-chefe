// Teste de banco: Postgres descartável, como src/lib/categorias-do-grupo.db.test.ts.
// Aprovações pendentes (#876): a lista traz o mínimo e o líquido congelados no pedido, e a Conta B,
// chamando com as lojas dela, não recebe o pedido da Conta A.
// listarAprovacoesPendentes usa o db global, então a semente grava de verdade e o after apaga pelo
// prefixo AP876 e pelos CNPJs do teste.
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
let db: Db['db']
let listarAprovacoesPendentes: typeof import('@/lib/queries/motos')['listarAprovacoesPendentes']

const P = 'AP876'
const CNPJS = ['87600000000101', '87600000000202']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarAprovacoesPendentes } = await import('@/lib/queries/motos'))
})

after(async () => {
  const grupos = sql`(select id from grupos where cnpj in (${sql.join(CNPJS.map(c => sql`${c}`), sql`, `)}))`
  await db.execute(sql`delete from aprovacoes_venda where loja_id in (select id from lojas where grupo_id in ${grupos})`)
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from modelos where modelo like ${P + ' %'}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%@teste.invalid'}`)
  await db.execute(sql`delete from lojas where grupo_id in ${grupos}`)
  await db.execute(sql`delete from grupos where cnpj in (${sql.join(CNPJS.map(c => sql`${c}`), sql`, `)})`)
  await db.execute(sql`delete from contas where nome like ${P + ' %'}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) =>
  ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id

/** Conta com um pedido "abaixo do mínimo" pendente: 9.950 em 12x, mínimo e líquido congelados. */
async function contaComPedido(nome: string, cnpj: string, snapshot: { minimo: string; liquido: string }) {
  const base: Base = await semearContaBase(db, { prefixo: P, nome, cnpj })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor' })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${`${P} ${nome}`}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${P + nome}, ${modeloId}, ${base.lojaId}, 'CINZA', ${'NF' + nome}, 'montada', 'aguardando_aprovacao') returning id`)
  const aprovacaoId = await idDe(sql`insert into aprovacoes_venda
      (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, valor_minimo_snapshot, liquido_snapshot)
    values (${motoId}, ${base.lojaId}, ${vendedorId}, '9950.00',
      ${JSON.stringify({ pagamentos: [{ tipo: 'cartao_credito', valor: 9950, parcelas: 12 }] })}::jsonb,
      'cliente pediu', ${snapshot.minimo}, ${snapshot.liquido}) returning id`)
  return { base, aprovacaoId }
}

test('a lista traz mínimo, líquido e valor do pedido, e a Conta B não recebe o pedido da Conta A (#876)', async () => {
  const a = await contaComPedido('A', CNPJS[0], { minimo: '10000.00', liquido: '9111.72' })
  const b = await contaComPedido('B', CNPJS[1], { minimo: '12000.00', liquido: '11000.00' })

  const daA = await listarAprovacoesPendentes([a.base.lojaId])
  assert.deepEqual(daA.map(p => p.id), [a.aprovacaoId])
  assert.deepEqual(
    { valor: daA[0].valor, minimo: daA[0].valorMinimoSnapshot, liquido: daA[0].liquidoSnapshot, estimado: daA[0].snapshotEstimado },
    { valor: '9950.00', minimo: '10000.00', liquido: '9111.72', estimado: false },
  )

  const daB = await listarAprovacoesPendentes([b.base.lojaId])
  assert.deepEqual(daB.map(p => p.id), [b.aprovacaoId], 'com as lojas da B volta só o pedido da B')
  assert.equal(daB[0].valorMinimoSnapshot, '12000.00')
})
