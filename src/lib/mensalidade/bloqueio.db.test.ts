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
type Bloqueio = typeof import('@/lib/mensalidade/bloqueio')
let db: Db['db']
let abertasCobraveis: Bloqueio['abertasCobraveis']
let situacaoMensalidade: Bloqueio['situacaoMensalidade']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ abertasCobraveis, situacaoMensalidade } = await import('@/lib/mensalidade/bloqueio'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('grupo isento com mensalidade vencida não aparece nem bloqueia; o pagante sim', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const isento = await linha(sql`with c as (insert into contas (nome) values ('Isento') returning id) insert into grupos (nome, cnpj, conta_id) select 'Isento', '00000000000191', id from c returning id`)
    const pagante = await linha(sql`with c as (insert into contas (nome) values ('Pagante') returning id) insert into grupos (nome, cnpj, conta_id) select 'Pagante', '00000000000272', id from c returning id`)
    await tx.execute(sql`insert into mensalidade_config (grupo_id, isento) values (${isento.id}, true)`)
    for (const g of [isento, pagante]) {
      await tx.execute(sql`insert into mensalidades (grupo_id, competencia, valor, vencimento) values (${g.id}, '2026-01', 499, '2026-01-10')`)
    }

    const abertas = await abertasCobraveis({ grupoIds: [isento.id, pagante.id] }, tx)
    assert.deepEqual(abertas.map(a => a.grupoNome), ['Pagante'])
    const agora = new Date('2026-03-01T12:00:00Z')
    assert.equal((await situacaoMensalidade(isento.id, [], agora, tx)).bloqueado, false)
    assert.equal((await situacaoMensalidade(pagante.id, [], agora, tx)).bloqueado, true)
    assert.deepEqual((await situacaoMensalidade(pagante.id, [isento.id], agora, tx)).outros, [])
    throw new Desfazer()
  }), Desfazer)
})
