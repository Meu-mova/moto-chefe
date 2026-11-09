// Teste de banco: Postgres descartável. Cron da cobrança com a adesão (#803): o regime antigo não
// muda (1ª mensalidade com a taxa, 30 dias após o 1º acesso); o regime novo fica fora da geração de
// mensalidades até o #805, mas a adesão sem link ganha o link; o e-mail do dia do vencimento é só
// da mensalidade. Fronteira mockada: Mercado Pago e e-mail.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'CRN803'
let emails: { para: string; assunto: string }[] = []
const mocks = [
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: { mensalidadeId: string }) => ({ id: `pref-${p.mensalidadeId}`, init_point: `https://mp.teste/${p.mensalidadeId}` }),
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
let gerarCobrancas: typeof import('@/lib/mensalidade/gerar')['gerarCobrancas']
let avisarVencimentos: typeof import('@/lib/mensalidade/gerar')['avisarVencimentos']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

// 1º acesso em 09/11/2026 (Brasília); o cron roda em 29/11, a 10 dias do 1º vencimento (09/12).
const ACESSO = new Date('2026-11-09T15:00:00Z')
const CRON = new Date('2026-11-29T15:00:00Z')

let cnpjSeq = 0
async function grupoComAcesso(nome: string, versao: 1 | 2): Promise<Base & { email: string }> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000082${String(++cnpjSeq).padStart(4, '0')}` })
  const email = `${nome.toLowerCase()}-${P.toLowerCase()}@teste.invalid`
  const [a] = await linhas(sql`insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, grupo_id, taxa_implantacao, valor_mensal, email)
    values (${g.nome}, 'Resp', '35999999999', 'x', 'login', '[]'::jsonb, ${g.grupoId}, 399, 499, ${email}) returning id`)
  await db.execute(sql`insert into contratos_adesao (adesao_id, token, status, html_snapshot, snapshot_hash, email_destino, expira_em, versao_cobranca)
    values (${a.id}, ${randomUUID()}, 'assinado', '<p>c</p>', 'h', ${email}, now() + interval '7 days', ${versao})`)
  const { registrarPrimeiroAcesso } = await import('@/lib/primeiro-acesso')
  await registrarPrimeiroAcesso(g.grupoId, ACESSO)
  return { ...g, email }
}

const cobrancasDo = (grupoId: string) => linhas(sql`
  select tipo, competencia, valor::text, vencimento::text, link_pagamento is not null as tem_link
  from mensalidades where grupo_id = ${grupoId} order by tipo, vencimento`)

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ gerarCobrancas, avisarVencimentos } = await import('@/lib/mensalidade/gerar'))
})

beforeEach(() => { emails = [] })

after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('regime antigo sem mudança: 1ª mensalidade com a taxa, 30 dias após o 1º acesso, sem adesão', async () => {
  const g = await grupoComAcesso('Antigo', 1)
  await gerarCobrancas(CRON)
  assert.deepEqual(await cobrancasDo(g.grupoId),
    [{ tipo: 'mensalidade', competencia: '2026-12', valor: '898.00', vencimento: '2026-12-09', tem_link: true }])
  assert.deepEqual(emails.filter(e => e.para === g.email).map(e => e.assunto), ['Mensalidade do MOVA: R$ 898,00, vence em 09/12/2026'])
})

test('regime novo: o cron não gera mensalidade e dá o link que faltou à adesão, com o e-mail de adesão', async () => {
  const g = await grupoComAcesso('Novo', 2)
  await gerarCobrancas(CRON)
  assert.deepEqual(await cobrancasDo(g.grupoId),
    [{ tipo: 'adesao', competencia: null, valor: '399.00', vencimento: '2026-11-09', tem_link: true }])
  assert.deepEqual(emails.filter(e => e.para === g.email).map(e => e.assunto), ['Adesão ao MOVA: R$ 399,00'])
})

test('o e-mail do dia do vencimento não vai para a adesão', async () => {
  const g = await grupoComAcesso('Aviso', 2)
  await avisarVencimentos(ACESSO)
  assert.deepEqual(emails.filter(e => e.para === g.email), [])
})
