/**
 * Regressão fiscal de ponta a ponta após a #347, na tela, contra o staging.
 *
 * Parte 1, com a Nota Gateway REAL em HOMOLOGAÇÃO (Grupo Teste Sul, aux.sul): emite a
 * NF pela tela até Autorizada, envia carta de correção até Autorizada, cancela a NF
 * (< 24 h) até Cancelada e cancela a venda; a NF fica no banco com venda_id nulo e o
 * número da venda. Recusa se o grupo não estiver em homologação.
 * Parte 2, sem Nota Gateway: trava do cancelamento da venda para o aux_adm, com NF
 * de produção autorizada semeada (ADR-0014) e com nº de NF preenchido (#191).
 *
 *   E2E_URL=http://localhost:3347 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-nf-regressao.ts [--ver] [--so-parte-2]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SEED_SENHA e
 * CERT_MASTER_KEY (abre a credencial da Nota Gateway para cancelar o que sobrar).
 * Grava vendas, motos e NFs sintéticas marcadas com E2E347G e apaga no fim só as NFs
 * mortas (contagem antes do delete). Log sem token em ~/Development/work/moto-chefe/ng-regressao-logs/.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { chromium, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { cancelarNfe, configNotaGateway, consultarNfe } from '@/lib/notagateway/client'
import { STATUS_MORTOS } from '@/lib/notagateway/status'
import { motivoRecusaForaDoStaging } from './lib/alvo-banco'
import { motivoRecusa } from './lib/e2e-mensalidade'
import { DOMINIO_TESTE } from './lib/seed-dados'

const base = process.env.E2E_URL?.replace(/\/$/, '') ?? ''
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
  ?? motivoRecusaForaDoStaging(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)
if (recusa || !process.env.SEED_SENHA) {
  console.error(recusa ? `Recusado: ${recusa}` : 'Falta no env: SEED_SENHA')
  process.exit(1)
}

const VER = process.argv.includes('--ver')
const SO_PARTE_2 = process.argv.includes('--so-parte-2')
const AUX = `aux.sul@${DOMINIO_TESTE}`
const MARCA = 'E2E347G'
const PASTA = '/tmp/e2e-347-regressao'
const LOGS = `${homedir()}/Development/work/moto-chefe/ng-regressao-logs`
const LOG = `${LOGS}/e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
const CPF = '529.982.247-25'
const TEXTO_CARTA = `Teste ${MARCA}: onde se le cor PRETA, leia-se cor CINZA. Sem valor fiscal.`

/** Status, números e motivos. A credencial nunca entra. */
async function registrar(evento: string, dados: unknown = {}) {
  process.stdout.write(`    · ${evento} ${JSON.stringify(dados)}\n`)
  await appendFile(LOG, `${new Date().toISOString()} ${evento} ${JSON.stringify(dados)}\n`)
}

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

type Ctx = { lojaId: string; grupoId: string; auxId: string; modeloId: string; ambiente: string }
type Venda = { id: string; numero: number; chassi: string; motoId: string }
// Números das vendas do teste: depois de cancelada a venda, a NF só se acha por eles.
const numerosDasVendas: number[] = []

/** Venda que a SEFAZ de homologação aceita: endereço completo, pagamento e ficha fiscal (como e2e-nf-reenvio.ts). */
async function semearVenda(c: Ctx, sufixo: string, extra: { notaFiscalSaida?: string } = {}): Promise<Venda> {
  const chassi = `${MARCA}${sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}, 'efetivado') returning id`)) as { id: string }[]
  // Ficha copiada de uma moto do staging com CEST: sem ele a SEFAZ recusa a saída com ICMS-ST.
  const [ref] = (await execRows(sql`select ncm, cest, origem, unidade from motos_fiscal where cest is not null and emitente_cnpj <> ${MARCA} order by moto_id limit 1`)) as
    { ncm: string; cest: string; origem: string | null; unidade: string | null }[]
  await execRows(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, cest, origem, unidade, x_prod)
    values (${moto.id}, ${MARCA}, ${ref?.ncm ?? '87116000'}, ${ref?.cest ?? null}, ${ref?.origem ?? '0'}, ${ref?.unidade ?? 'UN'}, ${'MOTO ELETRICA ' + MARCA})`)
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      cliente_cep, cliente_logradouro, cliente_numero, cliente_bairro, cliente_cidade, cliente_estado, valor, forma_pagamento, pagamentos, nf_liberada_em, nota_fiscal_saida)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, ${CPF},
      '37500-000', 'Rua Coronel Rennó', '100', 'Centro', 'Itajubá', 'MG', 1000, 'pix', ${JSON.stringify([{ tipo: 'pix', valor: 1000 }])}::jsonb, now(),
      ${extra.notaFiscalSaida ?? null})
    returning id, numero`)) as { id: string; numero: number }[]
  numerosDasVendas.push(venda.numero)
  return { id: venda.id, numero: venda.numero, chassi, motoId: moto.id }
}

async function entrar(pagina: Page) {
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', AUX)
  await pagina.fill('#password', process.env.SEED_SENHA!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
}

/** Painel lateral da venda, aberto pela busca de chassi (desktop). */
async function abrirPainel(pagina: Page, v: Venda) {
  await pagina.goto(`${base}/vendas?q=${v.chassi}`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: `Abrir venda #${v.numero}`, exact: true }).locator('visible=true').click()
  return pagina.getByRole('complementary', { name: `Venda #${v.numero}`, exact: true })
}

const dialogoNf = (pagina: Page) =>
  pagina.getByRole('dialog').filter({ has: pagina.getByText('NF de saída', { exact: true }) })

type LinhaNota = { id: string; id_externo: string; status: string; numero: string | null; motivo_status: string | null; venda_id: string | null; venda_numero: number }
const notaDaVenda = async (numero: number) =>
  ((await execRows(sql`select id, id_externo, status, numero, motivo_status, venda_id, venda_numero from notas_fiscais_saida
    where venda_numero = ${numero} order by criado_em desc limit 1`)) as LinhaNota[])[0]

/** Espera a condição no banco: a tela conferida depois, pelo texto. */
async function esperar<T>(pagina: Page, ler: () => Promise<T>, pronto: (v: T) => boolean, consultar = true): Promise<T> {
  let v = await ler()
  for (let i = 0; i < 40 && !pronto(v); i++) {
    const botao = dialogoNf(pagina).getByRole('button', { name: /Consultar/ }).first()
    if (consultar && await botao.count() && await botao.isEnabled()) await botao.click().catch(() => null)
    await pagina.waitForTimeout(5_000)
    v = await ler()
  }
  return v
}

async function fluxoCompleto(pagina: Page, c: Ctx) {
  console.log('\n▶ Parte 1: emitir → carta de correção → cancelar NF → cancelar venda (homologação real)')
  const v = await semearVenda(c, 'F')
  await registrar('venda', { numero: v.numero })

  // Emitir
  const painel = await abrirPainel(pagina, v)
  await painel.getByRole('button', { name: 'Emitir NF de saída' }).click()
  const dialogo = dialogoNf(pagina)
  await dialogo.getByRole('checkbox').first().check()
  await dialogo.getByRole('button', { name: /Transmitir teste/ }).click()
  const emitida = await esperar(pagina, () => notaDaVenda(v.numero), n => !!n && n.status !== 'Enviando' && n.status !== 'Processando')
  await registrar('emissao', emitida)
  confere(emitida?.status === 'Autorizada', 'emissão: NF Autorizada', JSON.stringify(emitida))
  confere(emitida?.id_externo === `mova-homolog-${v.numero}-1`, 'emissão: primeiro id da venda (sufixo 1)', emitida?.id_externo)
  confere(await dialogo.getByText(/NF-e .* autorizada/).first().isVisible().catch(() => false), 'emissão: a tela mostra a NF autorizada')
  if (emitida?.status !== 'Autorizada') return
  await pagina.screenshot({ path: `${PASTA}/1-emitida.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })

  // Carta de correção
  await dialogo.getByRole('button', { name: 'Carta de correção' }).click()
  await dialogo.getByLabel(/^Carta de correção nº/).fill(TEXTO_CARTA)
  await dialogo.getByRole('button', { name: 'Enviar à SEFAZ' }).click()
  const carta = await esperar(pagina,
    async () => ((await execRows(sql`select numero, situacao, status, motivo_status from notas_fiscais_saida_cartas where nota_id = ${emitida.id} order by numero desc limit 1`)) as
      { numero: number; situacao: string; status: string; motivo_status: string | null }[])[0],
    k => !!k && k.situacao !== 'pendente', false)
  await registrar('carta', carta)
  confere(carta?.situacao === 'autorizada', 'carta de correção autorizada', JSON.stringify(carta))
  await pagina.screenshot({ path: `${PASTA}/2-carta.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })

  // Cancelar NF (< 24 h)
  await dialogo.getByRole('button', { name: 'Cancelar NF' }).click()
  await dialogo.locator(`#motivo-${emitida.id}`).fill(`Teste ${MARCA} de regressao, sem valor fiscal`)
  await dialogo.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  const cancelada = await esperar(pagina, () => notaDaVenda(v.numero), n => n?.status === 'Cancelada' || n?.status === 'CancelamentoNegado')
  await registrar('cancelamento_nf', cancelada)
  confere(cancelada?.status === 'Cancelada', 'NF cancelada na SEFAZ', JSON.stringify(cancelada))
  confere(cancelada?.numero === emitida.numero, `número da NF mantido (${emitida.numero})`, cancelada?.numero ?? '')
  confere(await dialogo.getByText(`NF ${emitida.numero} cancelada na SEFAZ`).isVisible().catch(() => false), 'a tela mostra a NF cancelada')
  await pagina.screenshot({ path: `${PASTA}/3-nf-cancelada.png`, fullPage: true, animations: 'disabled', timeout: 60_000 })

  // Cancelar venda: NF morta não trava
  const painel2 = await abrirPainel(pagina, v)
  await painel2.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const d = pagina.getByRole('dialog')
  await d.locator('#motivo-cancelamento').fill(`Teste e2e ${MARCA}`)
  await d.getByRole('button', { name: 'Cancelar venda' }).click()
  for (let i = 0; i < 40 && await vendaExiste(v.id); i++) await pagina.waitForTimeout(500)
  confere(!(await vendaExiste(v.id)), 'a venda foi cancelada')
  const sobrou = await notaDaVenda(v.numero)
  await registrar('venda_cancelada', sobrou)
  confere(sobrou?.venda_id === null && sobrou?.status === 'Cancelada', `a NF continua no banco, Cancelada, com venda_id nulo e venda_numero ${v.numero}`, JSON.stringify(sobrou))
}

async function vendaExiste(id: string) {
  return ((await execRows(sql`select 1 from vendas where id = ${id}`)) as unknown[]).length > 0
}

async function travasDoAux(pagina: Page, c: Ctx) {
  console.log('\n▶ Parte 2: trava do cancelamento da venda para o aux_adm')
  const viva = await semearVenda(c, 'V')
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, numero, payload, data_autorizacao)
    values (${viva.id}, ${viva.numero}, ${c.grupoId}, ${`${MARCA}-AUT-${viva.numero}`}, 'Producao', 'Autorizada', '9347201', '{}'::jsonb, now())`)
  const p1 = await abrirPainel(pagina, viva)
  await p1.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const d1 = pagina.getByRole('dialog')
  confere(await d1.getByText('está autorizada na SEFAZ').waitFor({ timeout: 20_000 }).then(() => true, () => false), 'NF de produção viva: orientação do ADR-0014')
  confere(await d1.getByRole('button', { name: 'Cancelar venda' }).count() === 0, 'NF de produção viva: sem o botão de confirmar')
  confere(await vendaExiste(viva.id), 'NF de produção viva: a venda continua')
  await pagina.keyboard.press('Escape')

  const bling = await semearVenda(c, 'B', { notaFiscalSaida: '9347202' })
  const p2 = await abrirPainel(pagina, bling)
  await p2.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const d2 = pagina.getByRole('dialog')
  confere(await d2.getByText('Esta venda tem NF registrada (nº 9347202)').waitFor({ timeout: 20_000 }).then(() => true, () => false), 'nº de NF preenchido: aux_adm recebe a trava do #191')
  confere(await d2.getByRole('button', { name: 'Cancelar venda' }).count() === 0, 'nº de NF preenchido: sem o botão de confirmar')
  confere(await vendaExiste(bling.id), 'nº de NF preenchido: a venda continua')
}

/**
 * Cancela na Nota Gateway (homologação) o que ficou autorizado. A limpeza apaga a
 * nota real só se morta (a viva fica no banco em vez de órfã) e a sintética
 * E2E347G em qualquer status: ela nunca foi à Nota Gateway.
 */
async function cancelarAutorizadas(c: Ctx) {
  const cfg = await configNotaGateway(c.grupoId)
  if (!cfg || cfg.ambiente !== 'Homologacao' || !numerosDasVendas.length) return
  const vivas = (await execRows(sql`select id_externo from notas_fiscais_saida
    where grupo_id = ${c.grupoId} and ambiente = 'Homologacao' and status = 'Autorizada' and venda_numero in ${numerosDasVendas}`)) as { id_externo: string }[]
  for (const { id_externo } of vivas) {
    try {
      await cancelarNfe(cfg, id_externo)
      let status = ''
      for (let i = 0; i < 12 && status !== 'Cancelada'; i++) {
        await new Promise(r => setTimeout(r, 5_000))
        status = (await consultarNfe(cfg, id_externo))?.status ?? 'sem retorno'
      }
      await registrar('cancelamento_limpeza', { idExterno: id_externo, status })
      if (status === 'Cancelada') await execRows(sql`update notas_fiscais_saida set status = 'Cancelada' where id_externo = ${id_externo} and grupo_id = ${c.grupoId} and ambiente = 'Homologacao'`)
      else console.error(`Nota mantida no banco (não cancelou na Nota Gateway): ${id_externo}`)
    } catch (e) {
      falhas++
      console.error(`Cancelar ${id_externo} falhou: ${(e as Error).message}`)
    }
  }
}

async function limpar(c: Ctx) {
  const motos = sql`(select id from motos where chassi like ${MARCA + '%'})`
  const numeros = numerosDasVendas.length ? numerosDasVendas : [-1]
  const notas = sql`(select id from notas_fiscais_saida
    where grupo_id = ${c.grupoId} and (id_externo like ${MARCA + '-%'} or venda_numero in ${numeros})
      and (status in ${STATUS_MORTOS} or id_externo like ${MARCA + '-%'}))`
  const contagem = (await execRows(sql`select
    (select count(*) from notas_fiscais_saida_cartas where nota_id in ${notas})::int as cartas,
    (select count(*) from notas_fiscais_saida where id in ${notas})::int as notas,
    (select count(*) from motos_fiscal where moto_id in ${motos})::int as fichas,
    (select count(*) from vendas where moto_id in ${motos})::int as vendas,
    (select count(*) from pedidos_venda where moto_id in ${motos})::int as pedidos,
    (select count(*) from historico_estoque where moto_id in ${motos})::int as historico,
    (select count(*) from motos where id in ${motos})::int as motos`))[0]
  console.log(`\n▶ Limpeza (marcados ${MARCA}, vendas ${numerosDasVendas.join(', ')}): ${JSON.stringify(contagem)}`)
  await db.transaction(async tx => {
    await tx.execute(sql`delete from notas_fiscais_saida_cartas where nota_id in ${notas}`)
    await tx.execute(sql`delete from notas_fiscais_saida where id in ${notas}`)
    await tx.execute(sql`delete from vendas where moto_id in ${motos}`)
    await tx.execute(sql`delete from pedidos_venda where moto_id in ${motos}`)
    await tx.execute(sql`delete from historico_estoque where moto_id in ${motos}`)
    await tx.execute(sql`delete from motos_fiscal where moto_id in ${motos}`)
    await tx.execute(sql`delete from motos where id in ${motos}`)
  })
}

async function main() {
  const [aux] = (await execRows(sql`select u.id, u.loja_id, l.grupo_id from usuarios u join lojas l on l.id = u.loja_id where u.email = ${AUX}`)) as
    { id: string; loja_id: string; grupo_id: string }[]
  const [modelo] = (await execRows(sql`select id from modelos order by id limit 1`)) as { id: string }[]
  if (!aux || !modelo) throw new Error(`staging sem ${AUX} ou sem modelo`)
  const [cfg] = (await execRows(sql`select ambiente from notagateway_config where grupo_id = ${aux.grupo_id}`)) as { ambiente: string }[]
  if (!cfg) throw new Error('o grupo do aux.sul não tem a Nota Gateway configurada no staging')
  if (cfg.ambiente !== 'Homologacao') throw new Error(`o grupo do aux.sul está em ${cfg.ambiente} na Nota Gateway: recuso`)
  const c: Ctx = { lojaId: aux.loja_id, grupoId: aux.grupo_id, auxId: aux.id, modeloId: modelo.id, ambiente: cfg.ambiente }

  await mkdir(PASTA, { recursive: true })
  await mkdir(LOGS, { recursive: true })
  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    const pagina = await (await navegador.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } })).newPage()
    await entrar(pagina)
    if (!SO_PARTE_2) await fluxoCompleto(pagina, c)
    await travasDoAux(pagina, c)
    console.log(`\n  Log: ${LOG}`)
  } catch (e) {
    falhas++
    console.error(e instanceof Error ? e.message : e)
    const pagina = navegador.contexts().at(-1)?.pages()[0]
    if (pagina) {
      const arquivo = `${PASTA}/falha-${Date.now()}.png`
      await pagina.screenshot({ path: arquivo, fullPage: true, animations: 'disabled', timeout: 60_000 }).then(() => console.error(`Tela no momento: ${arquivo}`), () => null)
    }
  } finally {
    await navegador.close()
    await cancelarAutorizadas(c).catch(e => { falhas++; console.error(`Cancelamento falhou: ${(e as Error).message}`) })
    await limpar(c).catch(e => { falhas++; console.error(`Limpeza falhou: ${(e as Error).message}`) })
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nOk.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
