// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url
// Chave descartável só para o cifrar() do teste.
process.env.CERT_MASTER_KEY ??= 'a'.repeat(64)

type Db = typeof import('@/lib/db')
let db: Db['db']
let salvarCredencial: typeof import('@/lib/notagateway/credencial')['salvarCredencial']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ salvarCredencial } = await import('@/lib/notagateway/credencial'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const conta = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
  const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Cuiabá', '00000000000191', ${conta.id}) returning id`)
  return {
    grupo: grupo.id,
    socio: { id: 'socio', papel: 'admin_socio', contaId: conta.id },
    geral: { id: 'geral', papel: 'admin_geral', contaId: null },
  }
}

async function configDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select ambiente, serie_nfe from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { ambiente: string; serie_nfe: string }[] }
  return r.rows[0] ?? null
}

const payload = (grupoId: string) => ({ grupoId, token: 'token-novo', ambiente: 'Producao' as const, serieNfe: '2', proximoNumero: 1 })

test('admin_socio não grava a credencial da NG, nem do grupo da própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const r = await salvarCredencial(c.socio, payload(c.grupo), tx)
    assert.deepEqual(r, { ok: false, erro: 'Acesso restrito ao Admin Geral' })
    assert.equal(await configDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})

test('admin_socio não troca o ambiente de uma credencial que já existe', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into notagateway_config (grupo_id, token, ambiente) values (${c.grupo}, 'cifrado', 'Homologacao')`)
    const r = await salvarCredencial(c.socio, { ...payload(c.grupo), token: '' }, tx)
    assert.equal(r.ok, false)
    assert.equal((await configDoGrupo(tx, c.grupo))!.ambiente, 'Homologacao')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral grava a credencial do grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await salvarCredencial(c.geral, payload(c.grupo), tx), { ok: true })
    assert.deepEqual(await configDoGrupo(tx, c.grupo), { ambiente: 'Producao', serie_nfe: '2' })
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral com grupo inexistente recebe "Grupo não encontrado"', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await salvarCredencial(c.geral, payload('00000000-0000-0000-0000-000000000000'), tx), { ok: false, erro: 'Grupo não encontrado' })
    throw new Desfazer()
  }), Desfazer)
})
