// Teste de banco: Postgres descartável. Envio do contrato de adesão no regime novo (#806): o contrato
// enviado sai com o texto novo e a versão 2 da cobrança; o que já foi enviado ou assinado guarda
// versão, texto e hash (o texto antigo vive só no snapshot); reenviar um convite antigo gera um
// contrato novo na versão 2; assinado na versão 2, o 1º acesso cria a adesão.
// Fronteira mockada: sessão, e-mail e next/cache.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearAdesao, semearContaBase, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ENV806'
let usuarioDaSessao: Record<string, unknown> = {}
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
  mock.module('@/lib/email', { namedExports: { enviarEmail: async () => ({ status: 'enviado', id: 'x' }) } }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let enviarContratoAction: typeof import('./actions')['enviarContratoAction']
let registrarPrimeiroAcesso: typeof import('@/lib/primeiro-acesso')['registrarPrimeiroAcesso']
let geral: Record<string, unknown> = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows
const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex')
const CLAUSULA_34_NOVA = '3.4. Taxa de implantação: R$ 399,00, paga no primeiro acesso do CLIENTE ao sistema.'

let cnpjSeq = 0
async function adesaoCompleta(nome: string): Promise<Base & { adesaoId: string }> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000086${String(++cnpjSeq).padStart(4, '0')}` })
  const adesaoId = await semearAdesao(db, g)
  await db.execute(sql`update adesoes_mova set status = 'dados_completos', razao_social = ${`${nome} LTDA`}, cnpj = '11222333000181',
    endereco_sede = 'Rua A, 100, Centro, Lavras/MG', responsavel_cpf = '52998224725' where id = ${adesaoId}`)
  return { ...g, adesaoId }
}
async function contratoAntigo(adesaoId: string, status: string) {
  const html = `<p>contrato antigo ${randomUUID()}</p>`
  const [c] = await linhas(sql`insert into contratos_adesao (adesao_id, token, status, html_snapshot, snapshot_hash, email_destino, expira_em, evidencias_json, assinado_em)
    values (${adesaoId}, ${randomUUID()}, ${status}, ${html}, ${sha256(html)}, 'x@teste.invalid', now() + interval '7 days',
      ${status === 'assinado' ? sql`'{"ip":"1.2.3.4"}'::jsonb` : sql`null`}, ${status === 'assinado' ? sql`now()` : sql`null`})
    returning id, html_snapshot, snapshot_hash, evidencias_json`)
  return c
}
const contratosDa = (adesaoId: string) => linhas(sql`
  select id, status, versao_cobranca, html_snapshot, snapshot_hash, evidencias_json from contratos_adesao where adesao_id = ${adesaoId} order by criado_em`)

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ enviarContratoAction } = await import('./actions'))
  ;({ registrarPrimeiroAcesso } = await import('@/lib/primeiro-acesso'))
  const base = await semearContaBase(db, { prefixo: P, nome: 'Admin', cnpj: '00000000869999' })
  geral = { id: await semearUsuario(db, base, { papel: 'admin_geral', rotulo: 'geral', semLoja: true }), papel: 'admin_geral' }
})

beforeEach(() => { usuarioDaSessao = geral })

after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('o contrato enviado sai na versão 2, com o texto novo e o hash do próprio texto', async () => {
  const a = await adesaoCompleta('Novo')
  assert.deepEqual(await enviarContratoAction(a.adesaoId), { ok: true })
  const [c] = await contratosDa(a.adesaoId)
  assert.equal(c.versao_cobranca, 2)
  assert.ok(c.html_snapshot.includes(CLAUSULA_34_NOVA))
  assert.equal(c.snapshot_hash, sha256(c.html_snapshot))
})

test('reenviar um convite antigo: o antigo é cancelado com versão, texto e hash intactos; o novo nasce na versão 2', async () => {
  const a = await adesaoCompleta('Reenvio')
  const antigo = await contratoAntigo(a.adesaoId, 'pendente')
  assert.deepEqual(await enviarContratoAction(a.adesaoId), { ok: true })
  const [velho, novo] = await contratosDa(a.adesaoId)
  assert.deepEqual([velho.id, velho.status, velho.versao_cobranca, velho.html_snapshot, velho.snapshot_hash],
    [antigo.id, 'cancelado', 1, antigo.html_snapshot, antigo.snapshot_hash])
  assert.deepEqual([novo.status, novo.versao_cobranca], ['pendente', 2])
  assert.ok(novo.html_snapshot.includes(CLAUSULA_34_NOVA))
})

test('contrato antigo já assinado de outra adesão não muda com um envio novo; a adesão assinada recusa reenvio', async () => {
  const assinada = await adesaoCompleta('Assinada')
  const antes = await contratoAntigo(assinada.adesaoId, 'assinado')
  const outra = await adesaoCompleta('Outra')
  assert.deepEqual(await enviarContratoAction(outra.adesaoId), { ok: true })
  assert.deepEqual(await enviarContratoAction(assinada.adesaoId), { ok: false, erro: 'Esta adesão já tem contrato assinado' })
  assert.deepEqual((await contratosDa(assinada.adesaoId)).map(c => [c.id, c.status, c.versao_cobranca, c.html_snapshot, c.snapshot_hash, c.evidencias_json]),
    [[antes.id, 'assinado', 1, antes.html_snapshot, antes.snapshot_hash, antes.evidencias_json]])
})

test('contrato novo assinado: o regime lê a versão 2 e o 1º acesso do grupo cria a adesão', async () => {
  const a = await adesaoCompleta('FluxoNovo')
  await enviarContratoAction(a.adesaoId)
  await db.execute(sql`update contratos_adesao set status = 'assinado', assinado_em = now() where adesao_id = ${a.adesaoId}`)
  const { adesaoId } = await registrarPrimeiroAcesso(a.grupoId, new Date('2026-11-09T15:00:00Z'))
  assert.ok(adesaoId)
  assert.deepEqual(await linhas(sql`select tipo, valor::text, status from mensalidades where grupo_id = ${a.grupoId}`),
    [{ tipo: 'adesao', valor: '399.00', status: 'aberta' }])
})

test('quem não é admin_geral não envia contrato', async () => {
  const a = await adesaoCompleta('SoAdmin')
  usuarioDaSessao = { ...geral, papel: 'admin_socio' }
  await assert.rejects(enviarContratoAction(a.adesaoId), /Acesso restrito ao Admin Geral/)
  assert.deepEqual(await contratosDa(a.adesaoId), [])
})
