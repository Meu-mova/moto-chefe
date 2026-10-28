// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// O DRE usa o db global (sem transação), então os dados são gravados de verdade e
// apagados no after.
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
type Dre = typeof import('@/lib/queries/dre')
let db: Db['db']
let execRows: Db['execRows']
let dreDoMes: Dre['dreDoMes']
let dreEvolucao: Dre['dreEvolucao']
const lojas: Record<'a1' | 'a2' | 'b', string> = { a1: '', a2: '', b: '' }
const grupos: Record<'a' | 'b', string> = { a: '', b: '' }
const contas: string[] = []
const CNPJS = ['00000000048801', '00000000048802']

const linha = async (q: ReturnType<typeof sql>) => (await execRows(q))[0] as { id: string }
const lista = (ids: string[]) => sql.join(ids.map(i => sql`${i}`), sql`, `)

// Taxa = bruto − líquido de cada transação conciliada.
async function os(lojaId: string, usuarioId: string, grupoId: string, taxa: number) {
  const o = await linha(sql`insert into ordens_servico (loja_id, aberta_por, descricao, status, valor_servicos, data_conclusao)
    values (${lojaId}, ${usuarioId}, 'OS 488', 'concluida', 100, '2026-09-15T15:00:00Z'::timestamptz) returning id`)
  await db.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, valor_liquido, os_id, conciliado)
    values (${grupoId}, 'stone', '2026-09-15', 100, ${100 - taxa}, ${o.id}, true)`)
}
async function peca(lojaId: string, usuarioId: string, grupoId: string, taxa: number) {
  const p = await linha(sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, valor_total, data_venda)
    values (${lojaId}, ${usuarioId}, 'cartao', 50, '2026-09-20T15:00:00Z'::timestamptz) returning id`)
  await db.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, valor_liquido, peca_venda_id, conciliado)
    values (${grupoId}, 'stone', '2026-09-20', 50, ${50 - taxa}, ${p.id}, true)`)
}

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ dreDoMes, dreEvolucao } = await import('@/lib/queries/dre'))
  for (const [chave, cnpj] of [['a', CNPJS[0]], ['b', CNPJS[1]]] as const) {
    const conta = await linha(sql`insert into contas (nome) values (${'DRE 488 ' + chave}) returning id`)
    contas.push(conta.id)
    grupos[chave] = (await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'DRE 488 ' + chave}, ${cnpj}, ${conta.id}) returning id`)).id
  }
  for (const [chave, grupo] of [['a1', 'a'], ['a2', 'a'], ['b', 'b']] as const) {
    lojas[chave] = (await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 488 ' + chave}, 'C', 'R', ${grupos[grupo]}) returning id`)).id
  }
  const u = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Mec 488', 'mec488@teste.invalid', 'mecanico', ${lojas.a1}) returning id`)
  await os(lojas.a1, u.id, grupos.a, 10)
  await peca(lojas.a1, u.id, grupos.a, 5)
  await peca(lojas.a2, u.id, grupos.a, 3)
  await os(lojas.b, u.id, grupos.b, 7)
  await peca(lojas.b, u.id, grupos.b, 4)
})

after(async () => {
  const ids = Object.values(lojas)
  await db.execute(sql`delete from conciliacoes_cartao where grupo_id in (${lista(Object.values(grupos))})`)
  await db.execute(sql`delete from ordens_servico where loja_id in (${lista(ids)})`)
  await db.execute(sql`delete from vendas_pecas where loja_id in (${lista(ids)})`)
  await db.execute(sql`delete from usuarios where email = 'mec488@teste.invalid'`)
  await db.execute(sql`delete from lojas where id in (${lista(ids)})`)
  await db.execute(sql`delete from grupos where cnpj in (${lista(CNPJS)})`)
  await db.execute(sql`delete from contas where id in (${lista(contas)})`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const setembroDaA = { grupoId: '', lojaIds: [] as string[], ano: 2026, mes: 9 }

test('DRE do mês: taxa de cartão de OS e peça só das lojas pedidas, e a soma por loja bate com o total', async () => {
  const { colunas } = await dreDoMes({ ...setembroDaA, grupoId: grupos.a, lojaIds: [lojas.a1, lojas.a2] })
  const taxa = new Map(colunas.map(c => [c.chave, c.entrada.taxasCartao]))
  assert.equal(taxa.get(lojas.a1), 15)
  assert.equal(taxa.get(lojas.a2), 3)
  assert.equal(taxa.has(lojas.b), false, 'loja da Conta B não vira coluna')
  assert.equal(colunas.reduce((s, c) => s + c.entrada.taxasCartao, 0), 18, 'sem a taxa da Conta B')

  const soA2 = await dreDoMes({ ...setembroDaA, grupoId: grupos.a, lojaIds: [lojas.a2] })
  assert.deepEqual(soA2.colunas.map(c => [c.chave, c.entrada.taxasCartao]), [[lojas.a2, 3]])
})

test('DRE evolução: a taxa do mês é só das lojas pedidas e bate com a soma do DRE do mês', async () => {
  const evolucao = await dreEvolucao({ grupoId: grupos.a, lojaIds: [lojas.a1, lojas.a2], ano: 2026, mes: 9, meses: 2 })
  assert.deepEqual(evolucao.map(m => [m.mes, m.entrada.taxasCartao]), [[8, 0], [9, 18]])

  const daB = await dreEvolucao({ grupoId: grupos.b, lojaIds: [lojas.b], ano: 2026, mes: 9, meses: 1 })
  assert.equal(daB[0].entrada.taxasCartao, 11, 'a Conta B não vê a taxa da A')
})
