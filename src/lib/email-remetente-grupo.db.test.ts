// Teste de banco: Postgres descartável, como src/lib/contratos-grupo.db.test.ts.
// Local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
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
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let nomeRemetenteDoGrupo: typeof import('@/lib/email-remetente-grupo')['nomeRemetenteDoGrupo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ nomeRemetenteDoGrupo } = await import('@/lib/email-remetente-grupo'))
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

async function semearGrupo(tx: Tx, nome: string, cnpj: string, remetente: string | null) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'ER ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id, email_remetente_nome)
    values (${'ER ' + nome}, ${cnpj}, ${conta.id}, ${remetente}) returning id`)
  return grupo.id as string
}

test('cada grupo recebe o próprio remetente; o da Conta B não herda o da Conta A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'A', '11222333000181', 'Remetente A')
    const b = await semearGrupo(tx, 'B', '11444777000161', null)
    assert.equal(await nomeRemetenteDoGrupo(a, tx), 'Remetente A')
    assert.equal(await nomeRemetenteDoGrupo(b, tx), null)
  })
})

test('nome em branco no grupo, ou sem grupo, devolve null (sai o padrão)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await semearGrupo(tx, 'C', '11222333000181', '   ')
    assert.equal(await nomeRemetenteDoGrupo(c, tx), null)
    assert.equal(await nomeRemetenteDoGrupo(null, tx), null)
  })
})
