// Teste de banco: Postgres descartável. Cron da cobrança com a adesão (#803): o regime antigo não
// muda (1ª mensalidade com a taxa, 30 dias após o 1º acesso); o regime novo fica fora da geração de
// mensalidades até o #805, mas a adesão sem link ganha o link; o e-mail do dia do vencimento é só
// da mensalidade. Recuperação da adesão (#804): cria a que faltou depois do 1º acesso, gera o link
// da que ficou sem (inclusive em grupo sem valor mensal) e manda o e-mail uma vez; isento, regime
// antigo e sem 1º acesso ficam de fora; um grupo com problema não para os outros.
// Todos os testes que rodam o cron (global) ficam neste arquivo: os arquivos do test:db rodam em
// paralelo, e dois crons ao mesmo tempo processariam os grupos um do outro com outros mocks.
// Fronteira mockada: Mercado Pago e e-mail.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearAdesao, semearContaBase, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'CRN803'
let emails: { para: string; assunto: string }[] = []
// Simula outro caminho (1º acesso ou "Pagar") gravando o link enquanto o cron espera o Mercado Pago.
let durantePedido: ((mensalidadeId: string) => Promise<void>) | null = null
let emailsQueFalham: string[] = []
let adesoesSemMercadoPago: string[] = []
const mocks = [
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: { mensalidadeId: string }) => {
        await durantePedido?.(p.mensalidadeId)
        if (adesoesSemMercadoPago.includes(p.mensalidadeId)) throw new Error('Mercado Pago respondeu 503 em /checkout/preferences')
        return { id: `pref-${p.mensalidadeId}`, init_point: `https://mp.teste/${p.mensalidadeId}` }
      },
      expirarPreferencia: async () => {},
    },
  }),
  mock.module('@/lib/email', {
    namedExports: {
      enviarEmail: async (e: { para: string; assunto: string }) => {
        if (emailsQueFalham.includes(e.para)) return { status: 'erro', id: null }
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

beforeEach(() => { emails = []; durantePedido = null; emailsQueFalham = []; adesoesSemMercadoPago = [] })

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

test('adesão cujo link outro caminho gravou enquanto o cron esperava o Mercado Pago: o cron não sobrescreve nem manda e-mail', async () => {
  const g = await grupoComAcesso('Perdeu', 2)
  durantePedido = async id => {
    await db.execute(sql`update mensalidades set link_pagamento = 'https://mp.teste/outro' where id = ${id} and grupo_id = ${g.grupoId}`)
  }
  await gerarCobrancas(CRON)
  assert.deepEqual((await linhas(sql`select link_pagamento from mensalidades where grupo_id = ${g.grupoId}`)).map(l => l.link_pagamento), ['https://mp.teste/outro'])
  assert.deepEqual(emails.filter(e => e.para === g.email), [])
})

// ─── #804: o cron recupera a adesão ───────────────────────────────────────────
// 1º acesso em 09/11/2026 às 22h de Brasília (já 10/11 no UTC); o cron roda dias depois.
const ACESSO_804 = '2026-11-10T01:00:00Z'
const CRON_804 = new Date('2026-11-20T15:00:00Z')

async function grupoSemAdesao(nome: string, o: Parameters<typeof semearAdesao>[2] & { comAcesso?: boolean } = {}): Promise<Base & { email: string }> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000084${String(++cnpjSeq).padStart(4, '0')}` })
  const email = `adesao-${P.toLowerCase()}-${nome.toLowerCase()}@teste.invalid`
  await semearAdesao(db, g, { email, versao: 2, ...o })
  // 1º acesso gravado sem a adesão: o estado que o cron precisa recuperar.
  if (o.comAcesso !== false) await db.execute(sql`update grupos set primeiro_acesso_em = ${ACESSO_804} where id = ${g.grupoId}`)
  return { ...g, email }
}
const adesoesDo = (grupoId: string) => linhas(sql`
  select id, valor::text, vencimento::text, status, link_pagamento is not null as tem_link
  from mensalidades where grupo_id = ${grupoId} and tipo = 'adesao'`)
const abrirAdesaoSemLink = async (grupoId: string) => (await linhas(sql`insert into mensalidades (grupo_id, tipo, competencia, valor, vencimento)
  values (${grupoId}, 'adesao', null, 399, '2026-11-09') returning id`))[0].id as string
const resultadoDo = (r: Awaited<ReturnType<typeof gerarCobrancas>>, g: Base) => r.filter(x => x.grupo === `${P} ${g.nome}`)

test('1º acesso sem adesão: o cron cria uma (taxa da ficha, vence no dia de Brasília do 1º acesso), gera o link e manda um e-mail; de novo, nada muda', async () => {
  const g = await grupoSemAdesao('Faltou')
  await gerarCobrancas(CRON_804)
  await gerarCobrancas(CRON_804)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(({ valor, vencimento, status, tem_link }) => ({ valor, vencimento, status, tem_link })),
    [{ valor: '399.00', vencimento: '2026-11-09', status: 'aberta', tem_link: true }])
  assert.deepEqual(emails.filter(e => e.para === g.email).map(e => e.assunto), ['Adesão ao MOVA: R$ 399,00'])
})

test('o cron não cria adesão para taxa zero ou vazia, contrato v1, v2 não assinado, sem 1º acesso, grupo isento ou inativo', async () => {
  const casos = [
    ['Zero', { taxa: '0' }], ['Vazia', { taxa: null }], ['V1', { versao: 1 as const }],
    ['V2Pendente', { statusContrato: 'pendente' }], ['SemAcesso', { comAcesso: false }],
  ] as const
  const gs = await Promise.all(casos.map(([nome, o]) => grupoSemAdesao(nome, o)))
  const isento = await grupoSemAdesao('Isento')
  await db.execute(sql`insert into mensalidade_config (grupo_id, isento) values (${isento.grupoId}, true)`)
  const inativo = await grupoSemAdesao('Inativo')
  await db.execute(sql`update grupos set ativo = false where id = ${inativo.grupoId}`)
  await gerarCobrancas(CRON_804)
  for (const g of [...gs, isento, inativo]) assert.deepEqual(await adesoesDo(g.grupoId), [], g.nome)
})

test('adesão aberta sem link em grupo sem valor mensal: o cron gera o link e manda o e-mail', async () => {
  const g = await grupoSemAdesao('SemMensal', { valorMensal: null })
  const id = await abrirAdesaoSemLink(g.grupoId)
  await gerarCobrancas(CRON_804)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(a => [a.id, a.tem_link]), [[id, true]])
  assert.equal(emails.filter(e => e.para === g.email).length, 1)
})

test('adesão aberta sem link de grupo isento: o cron não gera link nem manda e-mail', async () => {
  const g = await grupoSemAdesao('IsentoComAdesao')
  await abrirAdesaoSemLink(g.grupoId)
  await db.execute(sql`insert into mensalidade_config (grupo_id, isento) values (${g.grupoId}, true)`)
  await gerarCobrancas(CRON_804)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(a => a.tem_link), [false])
  assert.deepEqual(emails.filter(e => e.para === g.email), [])
})

test('falha do e-mail aparece no resultado do cron, com o link já gravado', async () => {
  const g = await grupoSemAdesao('EmailFalha')
  emailsQueFalham = [g.email]
  const r = await gerarCobrancas(CRON_804)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(a => a.tem_link), [true])
  assert.match(resultadoDo(r, g).map(x => x.erro ?? '').join(';'), /e-mail erro/)
})

test('Mercado Pago falha só para um grupo: o erro fica nele e o outro ganha o link', async () => {
  const quebrado = await grupoSemAdesao('MpQuebrado')
  const bom = await grupoSemAdesao('MpBom')
  adesoesSemMercadoPago = [await abrirAdesaoSemLink(quebrado.grupoId)]
  await abrirAdesaoSemLink(bom.grupoId)
  const r = await gerarCobrancas(CRON_804)
  assert.deepEqual((await adesoesDo(quebrado.grupoId)).map(a => a.tem_link), [false])
  assert.match(resultadoDo(r, quebrado).map(x => x.erro ?? '').join(';'), /503/)
  assert.deepEqual((await adesoesDo(bom.grupoId)).map(a => a.tem_link), [true])
  assert.equal(emails.filter(e => e.para === bom.email).length, 1)
})
