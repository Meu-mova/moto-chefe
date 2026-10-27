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
  const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
  const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Cuiabá', '49.366.097/0001-40', ${conta.id}) returning id`)
  const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Teresina', '00000000000272', ${contaB.id}) returning id`)
  return {
    grupo: grupo.id, grupoB: grupoB.id,
    socio: { id: 'socio', papel: 'admin_socio', contaId: conta.id },
    geral: { id: 'geral', papel: 'admin_geral', contaId: null },
  }
}

async function configDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select ambiente from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { ambiente: string }[] }
  return r.rows[0] ?? null
}

async function empresaDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select empresa_id from notagateway_config where grupo_id = ${grupoId}`)) as unknown as { rows: { empresa_id: string | null }[] }
  return r.rows[0]?.empresa_id ?? null
}

/** Dublê da Consultar Empresa da NG: anota as chamadas e devolve o CNPJ cadastrado de cada empresa. */
function ngFalsa(cnpjs: Record<string, string>, opcoes: { foraDoAr?: boolean } = {}) {
  const chamadas: string[] = []
  return {
    chamadas,
    deps: {
      cnpjDaEmpresaNaNg: async (cfg: { empresaId: string }) => {
        chamadas.push(cfg.empresaId)
        if (opcoes.foraDoAr) throw new Error('fetch failed')
        const cnpj = cnpjs[cfg.empresaId]
        if (!cnpj) throw new Error('HTTP 400')
        return cnpj
      },
    },
  }
}

const payload = (grupoId: string) => ({ grupoId, token: 'token-novo', empresaId: '', ambiente: 'Producao' as const })
const semNg = ngFalsa({}).deps

test('admin_socio não grava a credencial da NG, nem do grupo da própria Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const r = await salvarCredencial(c.socio, payload(c.grupo), semNg, tx)
    assert.deepEqual(r, { ok: false, erro: 'Acesso restrito ao Admin Geral' })
    assert.equal(await configDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})

test('admin_socio não troca o ambiente de uma credencial que já existe', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into notagateway_config (grupo_id, token, ambiente) values (${c.grupo}, 'cifrado', 'Homologacao')`)
    const r = await salvarCredencial(c.socio, { ...payload(c.grupo), token: '' }, semNg, tx)
    assert.equal(r.ok, false)
    assert.equal((await configDoGrupo(tx, c.grupo))!.ambiente, 'Homologacao')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral grava a credencial do grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await salvarCredencial(c.geral, payload(c.grupo), semNg, tx), { ok: true })
    assert.deepEqual(await configDoGrupo(tx, c.grupo), { ambiente: 'Producao' })
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral com grupo inexistente recebe "Grupo não encontrado"', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await salvarCredencial(c.geral, payload('00000000-0000-0000-0000-000000000000'), semNg, tx), { ok: false, erro: 'Grupo não encontrado' })
    throw new Desfazer()
  }), Desfazer)
})

test('admin_geral grava o empresaId quando o CNPJ da empresa na NG é o do grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const ng = ngFalsa({ 'empresa-cuiaba': '49366097000140' })
    const r = await salvarCredencial(c.geral, { ...payload(c.grupo), empresaId: ' empresa-cuiaba ' }, ng.deps, tx)
    assert.deepEqual(r, { ok: true })
    assert.deepEqual(ng.chamadas, ['empresa-cuiaba'])
    assert.equal(await empresaDoGrupo(tx, c.grupo), 'empresa-cuiaba')
    throw new Desfazer()
  }), Desfazer)
})

test('admin_socio não grava o empresaId e a NG nem é consultada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const ng = ngFalsa({ 'empresa-cuiaba': '49366097000140' })
    const r = await salvarCredencial(c.socio, { ...payload(c.grupo), empresaId: 'empresa-cuiaba' }, ng.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Acesso restrito ao Admin Geral' })
    assert.deepEqual(ng.chamadas, [])
    assert.equal(await empresaDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})

test('CNPJ da empresa na NG diferente do grupo bloqueia, sem mostrar o CNPJ de lá', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const ng = ngFalsa({ 'empresa-outra': '11222333000181' })
    const r = await salvarCredencial(c.geral, { ...payload(c.grupo), empresaId: 'empresa-outra' }, ng.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Essa empresa da Nota Gateway tem outro CNPJ, diferente do CNPJ deste grupo.' })
    assert.equal(await configDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})

test('empresaId já ligado a grupo de outra Conta bloqueia, com frase que não diz qual', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id) values (${c.grupoB}, 'cifrado', 'empresa-cuiaba')`)
    const ng = ngFalsa({ 'empresa-cuiaba': '49366097000140' })
    const r = await salvarCredencial(c.geral, { ...payload(c.grupo), empresaId: 'empresa-cuiaba' }, ng.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Essa empresa da Nota Gateway já está ligada a outro grupo.' })
    assert.ok(!/Teresina|Conta B/.test(r.ok ? '' : r.erro))
    assert.equal(await empresaDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})

test('NG fora do ar: frase fixa e nada gravado', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const ng = ngFalsa({}, { foraDoAr: true })
    const r = await salvarCredencial(c.geral, { ...payload(c.grupo), empresaId: 'empresa-cuiaba' }, ng.deps, tx)
    assert.deepEqual(r, { ok: false, erro: 'Não deu para confirmar a empresa na Nota Gateway agora. Confira o token e o id e tente de novo.' })
    assert.equal(await configDoGrupo(tx, c.grupo), null)
    throw new Desfazer()
  }), Desfazer)
})
