// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/efetivar-pedido.db.test.ts.
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
let aplicarBaixa: typeof import('@/lib/mensalidade/baixa')['aplicarBaixa']
let mensalidades: typeof import('@/lib/db/schema')['mensalidades']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ aplicarBaixa } = await import('@/lib/mensalidade/baixa'))
  ;({ mensalidades } = await import('@/lib/db/schema'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('baixa uma vez só; a segunda vê que já foi baixada; ambiente trocado não baixa', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const grupo = await linha(sql`insert into grupos (nome, cnpj) values ('Pagante', '00000000000272') returning id`)
    const { id } = await linha(sql`insert into mensalidades (grupo_id, competencia, valor, vencimento) values (${grupo.id}, '2026-01', 499, '2026-01-10') returning id`)
    const ler = async () => (await tx.select().from(mensalidades).where(sql`${mensalidades.id} = ${id}`))[0]
    const pg = { id: 77, status: 'approved', external_reference: id, transaction_amount: 499, live_mode: false }

    assert.deepEqual(await aplicarBaixa({ ...pg, live_mode: true }, await ler(), false, tx), { acao: 'erro', registro: 'live_mode do pagamento diferente do ambiente' })
    assert.equal((await ler()).status, 'aberta')

    const aberta = await ler()
    assert.deepEqual(await aplicarBaixa(pg, aberta, false, tx), { acao: 'pagar', registro: null })
    assert.equal((await ler()).status, 'paga')
    // Mesma leitura antiga (aberta), como numa corrida com o webhook.
    assert.deepEqual(await aplicarBaixa(pg, aberta, false, tx), { acao: 'ignorar', registro: 'mensalidade já baixada por outra notificação' })
    throw new Desfazer()
  }), Desfazer)
})
