// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// As consultas do dashboard usam o db global (sem transação), então os dados são
// gravados de verdade e apagados no after.
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
let db: Db['db']
let getKPIs: Dash['getKPIs']
let getVendasPorDia: Dash['getVendasPorDia']
let lojaId = ''
let contaId = ''

const linha = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ getKPIs, getVendasPorDia } = await import('@/lib/queries/dashboard'))
  const conta = await linha(sql`insert into contas (nome) values ('Fuso 283') returning id`)
  contaId = conta.id
  const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Fuso 283', '00000000028300', ${conta.id}) returning id`)
  const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja Fuso 283', 'C', 'R', ${grupo.id}) returning id`)
  lojaId = loja.id
  const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Vend 283', 'vend283@teste.invalid', 'vendedor', ${loja.id}) returning id`)
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'F283', 'autopropelido', '1000', 'hub', '32') returning id`)
  // 22h30 de 31/10 em Brasília (01h30 de 01/11 em UTC) e 08h de 01/11 em Brasília.
  for (const [chassi, quando, numero] of [['FUSO283A', '2026-11-01T01:30:00Z', 928301], ['FUSO283B', '2026-11-01T11:00:00Z', 928302]] as const) {
    const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values (${chassi}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
    const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${loja.id}, ${vendedor.id}) returning id`)
    await db.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, numero, data_venda)
      values (${pedido.id}, ${moto.id}, ${loja.id}, ${vendedor.id}, ${vendedor.id}, 'Cliente', '52998224725', 10000, 'pix', ${numero}, ${quando}::timestamptz)`)
  }
})

after(async () => {
  await db.execute(sql`delete from vendas where loja_id = ${lojaId}`)
  await db.execute(sql`delete from pedidos_venda where loja_id = ${lojaId}`)
  await db.execute(sql`delete from motos where loja_id = ${lojaId}`)
  await db.execute(sql`delete from modelos where modelo = 'F283'`)
  await db.execute(sql`delete from usuarios where email = 'vend283@teste.invalid'`)
  await db.execute(sql`delete from lojas where id = ${lojaId}`)
  await db.execute(sql`delete from grupos where conta_id = ${contaId}`)
  await db.execute(sql`delete from contas where id = ${contaId}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const outubro = () => ({ dataInicio: '2026-10-01', dataFim: '2026-10-31', lojaId: [lojaId] })
const novembro = () => ({ dataInicio: '2026-11-01', dataFim: '2026-11-30', lojaId: [lojaId] })

test('venda às 22h30 de 31/10 (Brasília) conta em outubro, não em novembro', async () => {
  assert.equal((await getKPIs(outubro())).totalVendas, 1)
  assert.equal((await getKPIs(novembro())).totalVendas, 1)
})

test('vendas por dia: a das 22h30 cai em 31/10 e a das 8h em 01/11', async () => {
  assert.deepEqual((await getVendasPorDia(outubro())).map(d => [d.dia, d.total]), [['2026-10-31', 1]])
  assert.deepEqual((await getVendasPorDia(novembro())).map(d => [d.dia, d.total]), [['2026-11-01', 1]])
})
