// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// As consultas usam o db global, então os dados são gravados e apagados no after.
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
type Q = typeof import('@/lib/queries/garantias')
let db: Db['db']
let listarGarantias: Q['listarGarantias']
let exportarRelatorioGarantias: Q['exportarRelatorioGarantias']
const lojas: string[] = []

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarGarantias, exportarRelatorioGarantias } = await import('@/lib/queries/garantias'))
  const linha = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'G328', 'autopropelido', '1000', 'hub', '32') returning id`)
  for (const [nome, cnpj] of [['A', '00000000032801'], ['B', '00000000032802']]) {
    const conta = await linha(sql`insert into contas (nome) values (${'Garantia 328 ' + nome}) returning id`)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Garantia 328 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja G328 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
    lojas.push(loja.id)
    const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${'GAR328' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
    await db.execute(sql`insert into garantias (moto_id, loja_id, descricao, data_inicio, data_fim)
      values (${moto.id}, ${loja.id}, ${'Garantia ' + nome}, '2026-10-01', '2026-10-31')`)
  }
})

after(async () => {
  await db.execute(sql`delete from garantias where descricao like 'Garantia _' and loja_id in (select id from lojas where nome like 'Loja G328%')`)
  await db.execute(sql`delete from motos where chassi like 'GAR328%'`)
  await db.execute(sql`delete from modelos where modelo = 'G328'`)
  await db.execute(sql`delete from lojas where nome like 'Loja G328%'`)
  await db.execute(sql`delete from grupos where nome like 'Garantia 328%'`)
  await db.execute(sql`delete from contas where nome like 'Garantia 328%'`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('lista e relatório de garantias só trazem as lojas pedidas (#328)', async () => {
  const daB = await listarGarantias({ lojaIds: [lojas[1]], chassiBusca: 'GAR328' })
  assert.deepEqual(daB.map(g => g.chassi), ['GAR328B'])

  const relatorioB = await exportarRelatorioGarantias({ lojaIds: [lojas[1]] })
  assert.deepEqual(relatorioB.filter(r => r.chassi?.startsWith('GAR328')).map(r => r.chassi), ['GAR328B'])

  assert.deepEqual(await listarGarantias({ lojaIds: [], chassiBusca: 'GAR328' }), [], 'sem loja, nada')
  assert.deepEqual(await exportarRelatorioGarantias({ lojaIds: [] }), [], 'sem loja, nada')
})
