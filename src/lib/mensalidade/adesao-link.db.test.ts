// Teste de banco: Postgres descartável. Link e e-mail da adesão logo depois do 1º acesso (#803).
// O link é pedido fora da transação do 1º acesso: se o Mercado Pago falhar, a cobrança continua
// gravada, aberta e sem link, para o "Tentar de novo" e o cron. Fronteira mockada: Mercado Pago e e-mail.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ADL803'
type Preferencia = { mensalidadeId: string; tipo: string; titulo: string; valor: number }
let preferencias: Preferencia[] = []
let mpFora = false
let emails: { para: string; assunto: string }[] = []
const mocks = [
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: Preferencia) => {
        if (mpFora) throw new Error('Mercado Pago respondeu 503 em /checkout/preferences')
        preferencias = [...preferencias, p]
        return { id: `pref-${p.mensalidadeId}`, init_point: `https://mp.teste/${p.mensalidadeId}` }
      },
      expirarPreferencia: async () => {},
    },
  }),
  mock.module('@/lib/email', {
    namedExports: {
      enviarEmail: async (e: { para: string; assunto: string }) => {
        emails = [...emails, { para: e.para, assunto: e.assunto }]
        return { status: 'enviado', id: 'x' }
      },
    },
  }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let registrarPrimeiroAcesso: typeof import('@/lib/primeiro-acesso')['registrarPrimeiroAcesso']
let cobrarAdesao: typeof import('@/lib/mensalidade/link')['cobrarAdesao']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

let cnpjSeq = 0
async function adesaoAberta(nome: string): Promise<string> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000081${String(++cnpjSeq).padStart(4, '0')}` })
  const [a] = await linhas(sql`insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, grupo_id, taxa_implantacao, valor_mensal, email)
    values (${g.nome}, 'Resp', '35999999999', 'x', 'login', '[]'::jsonb, ${g.grupoId}, 399, 499, ${`resp-${nome}@teste.invalid`}) returning id`)
  await db.execute(sql`insert into contratos_adesao (adesao_id, token, status, html_snapshot, snapshot_hash, email_destino, expira_em, versao_cobranca)
    values (${a.id}, ${randomUUID()}, 'assinado', '<p>c</p>', 'h', 'resp@teste.invalid', now() + interval '7 days', 2)`)
  const { adesaoId } = await registrarPrimeiroAcesso(g.grupoId, new Date('2026-11-09T15:00:00Z'))
  assert.ok(adesaoId)
  return adesaoId
}

const gravada = async (id: string) => (await linhas(sql`
  select status, link_pagamento, mp_preference_id from mensalidades where id = ${id}`))[0]

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ registrarPrimeiroAcesso } = await import('@/lib/primeiro-acesso'))
  ;({ cobrarAdesao } = await import('@/lib/mensalidade/link'))
})

beforeEach(() => { preferencias = []; emails = []; mpFora = false })

after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('gera o link da adesão no valor da taxa e manda o e-mail de adesão para o e-mail da ficha', async () => {
  const id = await adesaoAberta('Ok')
  assert.deepEqual(await cobrarAdesao(id), { ok: true })
  assert.deepEqual(preferencias.map(p => ({ id: p.mensalidadeId, tipo: p.tipo, valor: p.valor })), [{ id, tipo: 'adesao', valor: 399 }])
  assert.deepEqual(await gravada(id), { status: 'aberta', link_pagamento: `https://mp.teste/${id}`, mp_preference_id: `pref-${id}` })
  assert.deepEqual(emails, [{ para: 'resp-Ok@teste.invalid', assunto: 'Adesão ao MOVA: R$ 399,00' }])
})

test('Mercado Pago fora: a adesão continua gravada, aberta e sem link, e nenhum e-mail sai', async () => {
  const id = await adesaoAberta('MpFora')
  mpFora = true
  const r = await cobrarAdesao(id)
  assert.equal(r.ok, false)
  assert.deepEqual(await gravada(id), { status: 'aberta', link_pagamento: null, mp_preference_id: null })
  assert.deepEqual(emails, [])
})

test('adesão que já tem link não pede outro nem reenvia o e-mail', async () => {
  const id = await adesaoAberta('JaTem')
  await cobrarAdesao(id)
  preferencias = []; emails = []
  assert.deepEqual(await cobrarAdesao(id), { ok: true })
  assert.deepEqual([preferencias, emails], [[], []])
})
