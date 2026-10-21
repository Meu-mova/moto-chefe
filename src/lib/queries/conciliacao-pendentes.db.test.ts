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
let db: Db['db']
let contarPendenciasCartao: typeof import('@/lib/queries/conciliacao-pendentes')['contarPendenciasCartao']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ contarPendenciasCartao } = await import('@/lib/queries/conciliacao-pendentes'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('o card de um grupo não conta pendências de outro grupo nem as anteriores ao corte', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Conta') returning id`)
    const outra = await linha(sql`insert into contas (nome) values ('Cliente novo') returning id`)
    const sul = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Sul', '00000000000191', ${conta.id}) returning id`)
    const novo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Novo', '00000000000272', ${outra.id}) returning id`)
    await tx.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, conciliado) values
      (${sul.id}, 'stone', '2026-09-10', 100, false),
      (${sul.id}, 'stone', '2026-09-11', 100, false),
      (${sul.id}, 'stone', '2026-09-12', 100, true),
      (${sul.id}, 'stone', '2026-07-31', 100, false)`)
    assert.equal(await contarPendenciasCartao(sul.id, tx), 2)
    assert.equal(await contarPendenciasCartao(novo.id, tx), 0, 'cliente novo começa zerado')
    throw new Desfazer()
  }), Desfazer)
})
