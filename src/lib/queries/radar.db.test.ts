// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// listarMotos usa o db global, então os dados são gravados e apagados no after.
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
type Motos = typeof import('@/lib/queries/motos')
let db: Db['db']
let listarMotos: Motos['listarMotos']
const contas: string[] = []

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarMotos } = await import('@/lib/queries/motos'))
  const linha = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'R320', 'autopropelido', '1000', 'hub', '32') returning id`)
  for (const [nome, cnpj, chassi] of [['A', '00000000032001', 'RADAR320A'], ['B', '00000000032002', 'RADAR320B']]) {
    const conta = await linha(sql`insert into contas (nome) values (${'Radar 320 ' + nome}) returning id`)
    contas.push(conta.id)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Radar 320 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja Radar 320 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
    await db.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${chassi}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida')`)
  }
})

after(async () => {
  await db.execute(sql`delete from motos where chassi like 'RADAR320%'`)
  await db.execute(sql`delete from modelos where modelo = 'R320'`)
  await db.execute(sql`delete from lojas where nome like 'Loja Radar 320%'`)
  await db.execute(sql`delete from grupos where nome like 'Radar 320%'`)
  await db.execute(sql`delete from contas where nome like 'Radar 320%'`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('Radar: busca por chassi da Conta B não acha moto da Conta A (#320)', async () => {
  const daB = await listarMotos({ chassiBusca: 'RADAR320', contaId: contas[1] })
  assert.deepEqual(daB.map(m => m.chassi), ['RADAR320B'])

  const semConta = await listarMotos({ chassiBusca: 'RADAR320' })
  assert.deepEqual(semConta.map(m => m.chassi).sort(), ['RADAR320A', 'RADAR320B'], 'sem Conta (admin_geral) acha as duas')
})
