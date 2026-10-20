/**
 * Teste de ponta a ponta da mensalidade (#166) contra o staging: cron, link do
 * Mercado Pago, aviso, bloqueio, webhook, desbloqueio e tela do admin.
 *
 *   E2E_URL=<preview ou https://dev.meumova.com> \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-mensalidade.ts
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, CRON_SECRET,
 * MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET e SEED_SENHA. Recusa a produção.
 *
 * Mexe só no "Grupo Teste Cobrança" (sintético, não isento) e o deixa pago e sem
 * bloqueio no fim. PIX e boleto aprovados não se testam: o sandbox não aprova. A
 * baixa usa um pagamento com cartão aprovado no sandbox em 17/10/2026, guardado
 * na mensalidade de referência (competência 1999-01).
 */
import { chromium, type Browser, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { motivoRecusa, assinarNotificacao } from './lib/e2e-mensalidade'

const base = process.env.E2E_URL?.replace(/\/$/, '') ?? ''
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
const faltando = ['CRON_SECRET', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'SEED_SENHA'].filter(n => !process.env[n])
if (recusa || faltando.length) {
  console.error(recusa ? `Recusado: ${recusa}` : `Faltam no env: ${faltando.join(', ')}`)
  process.exit(1)
}

const GRUPO = 'Grupo Teste Cobrança'
const SOCIO = 'socio.cobranca@teste.meumova.com'
const VENDEDOR = 'vendedor.cobranca@teste.meumova.com'
const GERAL = 'geral@teste.meumova.com'
const COMPETENCIA_REF = '1999-01'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}
function etapa(nome: string) {
  console.log(`\n${nome}`)
}

async function q<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return execRows(query) as Promise<T[]>
}

type Grupo = { id: string; loja_id: string }
type Mensalidade = { id: string; competencia: string; status: string; valor: string; acrescimo: string; link_pagamento: string | null; mp_preference_id: string | null; mp_payment_id: string | null }

async function prepararFixture(): Promise<{ grupo: Grupo; ref: Mensalidade }> {
  const [grupo] = await q<Grupo>(sql`
    select g.id, l.id as loja_id from grupos g join lojas l on l.grupo_id = g.id where g.nome = ${GRUPO} limit 1`)
  if (!grupo) throw new Error(`fixture ausente: ${GRUPO} com loja (ver PR #216)`)
  for (const email of [SOCIO, VENDEDOR]) {
    const [u] = await q<{ id: string }>(sql`select id from usuarios where email = ${email} and loja_id = ${grupo.loja_id}`)
    if (!u) throw new Error(`fixture ausente: usuário ${email} na loja do ${GRUPO}`)
  }

  // A mensalidade de referência guarda o pagamento aprovado do sandbox.
  let [ref] = await q<Mensalidade>(sql`
    select * from mensalidades where grupo_id = ${grupo.id} and competencia = ${COMPETENCIA_REF}`)
  if (!ref) {
    ;[ref] = await q<Mensalidade>(sql`
      update mensalidades set competencia = ${COMPETENCIA_REF}
      where id = (select id from mensalidades where grupo_id = ${grupo.id} and mp_payment_id is not null order by criado_em limit 1)
      returning *`)
  }
  if (!ref?.mp_payment_id) throw new Error('sem mensalidade de referência com pagamento aprovado no sandbox')

  await db.execute(sql`delete from mensalidades where grupo_id = ${grupo.id} and competencia <> ${COMPETENCIA_REF}`)
  await db.execute(sql`update mensalidades set status = 'paga', pago_em = coalesce(pago_em, now()) where id = ${ref.id}`)
  await db.execute(sql`
    insert into mensalidade_config (grupo_id, valor_mensal, taxa_implantacao, isento) values (${grupo.id}, 499, 999, false)
    on conflict (grupo_id) do update set valor_mensal = 499, taxa_implantacao = 999, isento = false`)
  await db.execute(sql`update grupos set primeiro_acesso_em = now() - interval '25 days' where id = ${grupo.id}`)
  return { grupo, ref }
}

async function rodarCron(): Promise<{ status: number; doGrupo?: { criadas: number; links: number; erro?: string } }> {
  const r = await fetch(`${base}/api/cron/mensalidades`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
  if (!r.ok) return { status: r.status }
  const corpo = await r.json() as { resultados: { grupo: string; criadas: number; links: number; erro?: string }[] }
  return { status: r.status, doGrupo: corpo.resultados.find(x => x.grupo === GRUPO) }
}

async function aberta(grupoId: string): Promise<Mensalidade | undefined> {
  const [m] = await q<Mensalidade>(sql`
    select * from mensalidades where grupo_id = ${grupoId} and competencia <> ${COMPETENCIA_REF} order by competencia limit 1`)
  return m
}

async function entrar(navegador: Browser, email: string): Promise<Page> {
  // O checkout do Mercado Pago recusa o user agent "HeadlessChrome" (página de erro).
  const contexto = await navegador.newContext({ userAgent: USER_AGENT, locale: 'pt-BR' })
  const pagina = await contexto.newPage()
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', email)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
  return pagina
}

async function abrir(pagina: Page, caminho: string): Promise<{ caminho: string; texto: string }> {
  await pagina.goto(`${base}${caminho}`, { waitUntil: 'load', timeout: 45_000 })
  await pagina.waitForTimeout(1_500)
  return { caminho: new URL(pagina.url()).pathname, texto: await pagina.locator('body').innerText() }
}

async function notificar(dataId: string, notificacaoId: string, assinar = true): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const requestId = `e2e-${notificacaoId}`
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-request-id': requestId }
  if (assinar) headers['x-signature'] = assinarNotificacao(process.env.MP_WEBHOOK_SECRET!, dataId, requestId, String(Math.floor(Date.now() / 1000)))
  const r = await fetch(`${base}/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, {
    method: 'POST', headers,
    body: JSON.stringify({ id: notificacaoId, type: 'payment', action: 'payment.updated', live_mode: false, data: { id: dataId } }),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) as Record<string, unknown> }
}

async function main() {
  console.log(`E2E da mensalidade contra ${base}`)
  etapa('1. Preparo')
  const { grupo, ref } = await prepararFixture()
  confere(true, `${GRUPO} zerado, 1º acesso há 25 dias, referência ${COMPETENCIA_REF} paga`)

  etapa('2. Cron')
  const c1 = await rodarCron()
  confere(c1.status === 200, 'cron responde 200', String(c1.status))
  confere(c1.doGrupo?.criadas === 1 && c1.doGrupo?.links === 1, '1ª rodada cria 1 cobrança com link', JSON.stringify(c1.doGrupo))
  const c2 = await rodarCron()
  confere(c2.doGrupo?.criadas === 0 && c2.doGrupo?.links === 0, '2ª rodada não cria nada', JSON.stringify(c2.doGrupo))
  const m = await aberta(grupo.id)
  confere(!!m && Number(m.valor) === 1498, '1ª mensalidade = R$ 499 + R$ 999 de implantação', m?.valor)
  if (!m) throw new Error('sem mensalidade criada; parando')

  etapa('3. Link do Mercado Pago')
  const pref = await (await fetch(`https://api.mercadopago.com/checkout/preferences/${m.mp_preference_id}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  })).json() as { external_reference?: string; notification_url?: string; payment_methods?: { excluded_payment_types?: { id: string }[] } }
  const excluidos = (pref.payment_methods?.excluded_payment_types ?? []).map(t => t.id)
  confere(['credit_card', 'debit_card', 'prepaid_card'].every(t => excluidos.includes(t)), 'cartões excluídos (só PIX e boleto)', excluidos.join(','))
  confere(pref.external_reference === m.id, 'external_reference = id da mensalidade')
  confere(!!pref.notification_url?.endsWith('/api/webhooks/mercadopago'), 'notification_url aponta para o webhook', pref.notification_url)

  const navegador = await chromium.launch()
  try {
    etapa('4. Aviso no topo')
    const socio = await entrar(navegador, SOCIO)
    let t = await abrir(socio, '/dashboard')
    confere(t.caminho === '/dashboard' && t.texto.includes(`Mensalidade do MOVA de ${GRUPO}: R$ 1.498,00`), 'sócio vê a faixa do grupo ativo com R$ 1.498,00', t.caminho)
    t = await abrir(socio, '/mensalidade')
    confere(t.texto.includes('R$ 1.498,00') && t.texto.includes('Pagar'), 'sócio vê a cobrança e o botão Pagar em /mensalidade')
    const vendedor = await entrar(navegador, VENDEDOR)
    t = await abrir(vendedor, '/dashboard')
    confere(t.caminho === '/dashboard' && !t.texto.includes('Mensalidade do MOVA'), 'vendedor não vê a faixa')

    etapa('5. Bloqueio (6 dias de atraso)')
    await db.execute(sql`update mensalidades set vencimento = (now() at time zone 'America/Sao_Paulo')::date - 6 where id = ${m.id}`)
    t = await abrir(socio, '/dashboard')
    confere(t.caminho === '/mensalidade' && t.texto.includes('Acesso suspenso'), 'sócio é levado a "Acesso suspenso"', t.caminho)
    t = await abrir(vendedor, '/estoque')
    confere(t.caminho === '/mensalidade' && t.texto.includes('Fale com o responsável'), 'vendedor vê "fale com o responsável"', t.caminho)
    const prefAntiga = m.mp_preference_id
    await abrir(socio, '/mensalidade')
    await Promise.all([
      socio.waitForURL(u => u.hostname.includes('mercadopago'), { timeout: 30_000 }),
      socio.getByRole('button', { name: 'Pagar' }).first().click(),
    ])
    confere(socio.url().includes('mercadopago'), 'Pagar abre o checkout do Mercado Pago')
    // O checkout passa por redirecionamentos antes de listar os meios de pagamento.
    await socio.getByText('Boleto').first().waitFor({ timeout: 30_000 }).catch(() => {})
    const checkout = await socio.locator('body').innerText()
    const temCartao = /cart[aã]o de cr[eé]dito|cart[aã]o de d[eé]bito|cr[eé]dito ou pr[eé]-pago/i.test(checkout)
    confere(checkout.includes('Pix') && checkout.includes('Boleto') && !temCartao, 'checkout mostra só Pix e Boleto',
      `pix=${checkout.includes('Pix')} boleto=${checkout.includes('Boleto')} cartão=${temCartao}`)
    const [mAtraso] = await q<Mensalidade>(sql`select * from mensalidades where id = ${m.id}`)
    confere(Number(mAtraso.acrescimo) > 0 && mAtraso.mp_preference_id !== prefAntiga, 'link refeito com multa e juros', mAtraso.acrescimo)

    etapa('6. Webhook')
    const semAssinatura = await notificar(ref.mp_payment_id!, `sem-${Date.now()}`, false)
    confere(semAssinatura.status === 401, 'sem assinatura → 401', String(semAssinatura.status))
    await db.execute(sql`update mensalidades set status = 'aberta', pago_em = null where id = ${ref.id}`)
    const nid = `e2e-${Date.now()}`
    const n1 = await notificar(ref.mp_payment_id!, nid)
    const [refDepois] = await q<Mensalidade>(sql`select * from mensalidades where id = ${ref.id}`)
    confere(n1.status === 200 && n1.corpo.acao === 'pagar' && refDepois.status === 'paga', 'pagamento aprovado dá baixa', JSON.stringify(n1.corpo))
    const n2 = await notificar(ref.mp_payment_id!, nid)
    confere(n2.corpo.repetida === true, 'mesma notificação de novo → ignorada', JSON.stringify(n2.corpo))

    etapa('7. Desbloqueio')
    // PIX e boleto não aprovam no sandbox: a baixa da cobrança do mês é simulada no banco.
    await db.execute(sql`update mensalidades set status = 'paga', pago_em = now() where id = ${m.id}`)
    t = await abrir(socio, '/dashboard')
    confere(t.caminho === '/dashboard' && !t.texto.includes('Mensalidade do MOVA'), 'paga, o sócio volta ao sistema sem faixa', t.caminho)

    etapa('8. Admin')
    await db.execute(sql`update mensalidades set status = 'aberta', pago_em = null where id = ${ref.id}`)
    const geral = await entrar(navegador, GERAL)
    t = await abrir(geral, '/admin/mensalidades')
    confere(t.texto.includes(GRUPO) && t.texto.includes('Conferir agora'), `admin vê o ${GRUPO} e o "Conferir agora"`)
    await geral.getByRole('button', { name: 'Conferir agora' }).first().click()
    await geral.waitForTimeout(6_000)
    const [refAdmin] = await q<Mensalidade>(sql`select * from mensalidades where id = ${ref.id}`)
    confere(refAdmin.status === 'paga', '"Conferir agora" acha o pagamento aprovado e dá baixa', refAdmin.status)
  } finally {
    await navegador.close()
    // Estado final neutro: tudo pago, sem bloqueio.
    await db.execute(sql`update mensalidades set status = 'paga', pago_em = coalesce(pago_em, now()) where grupo_id = ${grupo.id}`)
  }

  console.log(falhas === 0 ? '\nE2E da mensalidade ok.' : `\nE2E da mensalidade falhou em ${falhas} verificação(ões).`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(`E2E quebrou: ${(e as Error).message}`)
  process.exit(1)
})
