// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// As consultas usam o db global (sem transação), então os dados são gravados de
// verdade e apagados no after.
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
type Dash = typeof import('@/lib/queries/dashboard')
type Motos = typeof import('@/lib/queries/motos')
let db: Db['db']
let execRows: Db['execRows']
let getKPIs: Dash['getKPIs']
let getEstoquePorLoja: Dash['getEstoquePorLoja']
let listarMotos: Motos['listarMotos']
let lojaId = ''
let contaId = ''

const linha = async (q: ReturnType<typeof sql>) => (await execRows(q))[0] as { id: string }

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ getKPIs, getEstoquePorLoja } = await import('@/lib/queries/dashboard'))
  ;({ listarMotos } = await import('@/lib/queries/motos'))
  const conta = await linha(sql`insert into contas (nome) values ('Showroom 310') returning id`)
  contaId = conta.id
  const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Showroom 310', '00000000031000', ${conta.id}) returning id`)
  const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja Showroom 310', 'C', 'R', ${grupo.id}) returning id`)
  lojaId = loja.id
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'S310', 'autopropelido', '1000', 'hub', '32') returning id`)
  // Preços diferentes dizem quais motos entraram na soma do valor.
  const motos = [
    ['SHOW310A', 'montada', 'disponivel', 1000, false],
    ['SHOW310B', 'vendida', 'reservada', 2000, false],
    ['SHOW310C', 'vendida', 'vendida', 4000, false],
    ['SHOW310D', 'montada', 'disponivel', 8000, true],
  ] as const
  for (const [chassi, status, disponibilidade, preco, somenteGarantia] of motos) {
    await db.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade, preco_compra, somente_garantia)
      values (${chassi}, ${modelo.id}, ${loja.id}, 'CINZA', '1', ${status}, ${disponibilidade}, ${preco}, ${somenteGarantia})`)
  }
})

after(async () => {
  await db.execute(sql`delete from motos where loja_id = ${lojaId}`)
  await db.execute(sql`delete from modelos where modelo = 'S310'`)
  await db.execute(sql`delete from lojas where id = ${lojaId}`)
  await db.execute(sql`delete from grupos where conta_id = ${contaId}`)
  await db.execute(sql`delete from contas where id = ${contaId}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('showroom: dashboard e tela contam as mesmas 2 motos (montada e vendida com disponibilidade reservada)', async () => {
  const tela = await listarMotos({ excluirVendidas: true, lojaId: [lojaId] })
  assert.deepEqual(tela.map(m => m.chassi).sort(), ['SHOW310A', 'SHOW310B'])

  const kpis = await getKPIs({ dataInicio: '2026-10-01', dataFim: '2026-10-31', lojaId: [lojaId] })
  assert.equal(kpis.estoque, 2)
  assert.equal(kpis.valorEstoque, 3000)

  assert.deepEqual(await getEstoquePorLoja([lojaId]), [{ loja: 'Loja Showroom 310', total: 2 }])
})
