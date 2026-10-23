/**
 * Teste de ponta a ponta da #347 (PR 2a e 2b-2) contra o staging: ao abrir "Emitir NF
 * de saída" de uma venda cuja última tentativa foi recusada, o diálogo abre na tela da
 * recusa, com os campos que o código aponta: 237 o cliente, 778 a moto, GW7324 só a
 * orientação da configuração fiscal (o aux_adm pede a um Admin), 302 a IE do cliente
 * e 301 só a orientação. "Só salvar" grava na venda e na ficha, e o diálogo continua
 * aberto. Desktop e celular, com telas em /tmp/e2e-347-pr2/.
 *
 *   E2E_URL=http://localhost:3349 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-nf-reenvio.ts [--ver]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Recusa fora do staging. Grava vendas, motos e NFs sintéticas marcadas com E2E347R
 * e apaga tudo no fim. Não envia nem consulta nota: abrir o diálogo só lê a empresa
 * na Nota Gateway (homologação do grupo do aux.sul) para montar a conferência, e
 * "Salvar e reenviar" não é clicado. --ver abre o navegador visível e devagar.
 */
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
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
const AUX = `aux.sul@${DOMINIO_TESTE}`
const MARCA = 'E2E347R'
const PASTA = '/tmp/e2e-347-pr2'

let falhas = 0
function confere(ok: boolean, descricao: string, detalhe = '') {
  if (!ok) falhas++
  console.log(`  ${ok ? '✓' : '✗'} ${descricao}${!ok && detalhe ? ` (${detalhe})` : ''}`)
}

type Ctx = { lojaId: string; grupoId: string; auxId: string; modeloId: string; ambiente: string }
type Caso = { sufixo: string; motivo: string; numero: string; documento: string; venda?: { id: string; numero: number; chassi: string; motoId: string } }

const CPF = '529.982.247-25'
const CNPJ = '11.222.333/0001-81'
const CASOS: Caso[] = [
  { sufixo: 'C', motivo: '237 - Rejeição: CPF do destinatário inválido', numero: '9347101', documento: CPF },
  { sufixo: 'M', motivo: '778 - Rejeição: Informado NCM inexistente', numero: '9347104', documento: CPF },
  { sufixo: 'G', motivo: 'Código: GW7324\r\nDescrição: O CFOP do produto deve conter apenas números.', numero: '9347105', documento: CPF },
  { sufixo: 'E', motivo: '301 - Uso Denegado: Irregularidade fiscal do emitente', numero: '9347102', documento: CPF },
  { sufixo: 'D', motivo: '302 - Uso Denegado: Irregularidade fiscal do destinatário', numero: '9347103', documento: CNPJ },
]

async function semear(c: Ctx, caso: Caso) {
  const chassi = `${MARCA}${caso.sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  // Efetivado, como o pedido de uma venda de verdade: pendente apareceria em "Pedidos Pendentes".
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}, 'efetivado') returning id`)) as { id: string }[]
  await execRows(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod) values (${moto.id}, ${MARCA}, '87116000', ${'MOTO ' + MARCA})`)
  // NF liberada sem contrato: senão o diálogo para na trava da assinatura.
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, nf_liberada_em)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, ${caso.documento}, 1000, 'pix', now()) returning id, numero`)) as { id: string; numero: number }[]
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, payload)
    values (${venda.id}, ${venda.numero}, ${c.grupoId}, ${`${MARCA}-${caso.sufixo}-${venda.numero}`}, ${c.ambiente}, 'Negada', ${caso.motivo}, ${caso.numero}, '{}'::jsonb)`)
  caso.venda = { id: venda.id, numero: venda.numero, chassi, motoId: moto.id }
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

/**
 * Abre "Emitir NF de saída" pela busca de chassi. Desktop: "Abrir venda #N" abre o
 * painel lateral. Celular: o cartão da venda ("#N · data …") abre a gaveta.
 */
async function abrirNf(pagina: Page, v: { numero: number; chassi: string }, celular: boolean) {
  await pagina.goto(`${base}/vendas?q=${v.chassi}`, { waitUntil: 'networkidle' })
  if (celular) {
    await pagina.getByRole('button', { name: new RegExp(`^#${v.numero} · `) }).click()
    await pagina.getByRole('dialog').getByRole('button', { name: 'Emitir NF de saída' }).click()
  } else {
    await pagina.getByRole('button', { name: `Abrir venda #${v.numero}`, exact: true }).locator('visible=true').click()
    await pagina.getByRole('complementary', { name: `Venda #${v.numero}`, exact: true }).getByRole('button', { name: 'Emitir NF de saída' }).click()
  }
}

async function telaDoCaso(pagina: Page, caso: Caso, tela: string) {
  await abrirNf(pagina, caso.venda!, tela === 'celular')
  const dialogo = pagina.getByRole('dialog').filter({ hasText: 'Por quê?' })
  const ve = (texto: string | RegExp) => dialogo.getByText(texto).first().waitFor({ timeout: 30_000 }).then(() => true, () => false)
  const botao = (nome: string | RegExp) => dialogo.getByRole('button', { name: nome })
  const n = caso.numero
  const cod = caso.sufixo
  confere(await ve(`Nota nº ${n} · venda nº ${caso.venda!.numero}`), `${tela} ${cod}: número da nota e da venda`)
  confere(!(await dialogo.innerText()).includes('—'), `${tela} ${cod}: sem travessão`)

  if (cod === 'C' || cod === 'M') {
    confere(await ve('A SEFAZ recusou esta nota'), `${tela} ${cod}: título da recusa`)
    confere(await ve('Corrigir aqui'), `${tela} ${cod}: grupo apontado marcado`)
    const campo = cod === 'C' ? 'CPF ou CNPJ' : 'NCM'
    confere(await dialogo.getByLabel(campo, { exact: true }).isVisible(), `${tela} ${cod}: campo ${campo} aberto`)
    confere(await botao(`Salvar e reenviar nº ${n}`).count() === 1, `${tela} ${cod}: "Salvar e reenviar nº ${n}"`)
    confere(await botao('Só salvar').count() === 1, `${tela} ${cod}: "Só salvar"`)
  } else if (cod === 'G') {
    confere(await ve('O CFOP do produto está num formato que a nota não aceita.'), `${tela} ${cod}: "Por quê?" em linguagem de loja`)
    confere(await ve('Peça a um Admin Geral ou Sócio para corrigir.'), `${tela} ${cod}: aux_adm é orientado a pedir ao Admin`)
    confere(await dialogo.getByRole('textbox').count() === 0, `${tela} ${cod}: sem campos`)
    confere(await botao(`Reenviar nº ${n}`).count() === 1, `${tela} ${cod}: "Reenviar nº ${n}"`)
  } else {
    confere(await ve('A SEFAZ bloqueou esta nota'), `${tela} ${cod}: título da bloqueada`)
    confere(await ve('Fica bloqueado e não volta.'), `${tela} ${cod}: o número não volta`)
    confere(await botao(new RegExp(`Reenviar nº ${n}`)).count() === 0, `${tela} ${cod}: sem reenviar o mesmo número`)
    if (cod === 'D') {
      confere(await ve('O cliente tem Inscrição Estadual?'), `${tela} ${cod}: pergunta da IE`)
      confere(await botao('Salvar e emitir a nova nota').count() === 1, `${tela} ${cod}: "Salvar e emitir a nova nota"`)
    } else {
      confere(await ve('Consulte a Inscrição Estadual da empresa no SINTEGRA.'), `${tela} ${cod}: orientação da IE da empresa`)
      confere(await dialogo.getByRole('textbox').count() === 0, `${tela} ${cod}: sem campos`)
    }
  }
  await pagina.screenshot({ path: `${PASTA}/${tela}-${cod}.png`, fullPage: true })

  // Só salvar: grava no cadastro e o diálogo continua na recusa (revalidatePath não o desmonta).
  if (tela === 'desktop' && (cod === 'C' || cod === 'M' || cod === 'D')) {
    if (cod === 'C') await dialogo.getByLabel('Cidade', { exact: true }).fill(`Cidade ${MARCA}`)
    if (cod === 'M') await dialogo.getByLabel('CEST', { exact: true }).fill('0107700')
    if (cod === 'D') await dialogo.getByText('É isento').click()
    await botao('Só salvar').click()
    const salvou = await ve('Correção salva na venda.')
    confere(salvou, `${tela} ${cod}: "Só salvar" confirma`)
    confere(await ve(`Nota nº ${n} · venda nº ${caso.venda!.numero}`), `${tela} ${cod}: o diálogo continua aberto na recusa`)
    const [v] = (await execRows(sql`select v.cliente_cidade, v.cliente_indicador_ie, f.cest from vendas v
      join motos_fiscal f on f.moto_id = v.moto_id where v.id = ${caso.venda!.id}`)) as { cliente_cidade: string | null; cliente_indicador_ie: string | null; cest: string | null }[]
    if (cod === 'C') confere(v.cliente_cidade === `Cidade ${MARCA}`, `${tela} ${cod}: cidade gravada na venda`, String(v.cliente_cidade))
    if (cod === 'M') confere(v.cest === '0107700', `${tela} ${cod}: CEST gravado na ficha da moto`, String(v.cest))
    if (cod === 'D') confere(v.cliente_indicador_ie === 'isento', `${tela} ${cod}: IE "isento" gravada na venda`, String(v.cliente_indicador_ie))
    await pagina.screenshot({ path: `${PASTA}/${tela}-${cod}-salvo.png`, fullPage: true })
  }
}

async function limpar() {
  const motos = sql`(select id from motos where chassi like ${MARCA + '%'})`
  const notas = sql`(select id from notas_fiscais_saida where id_externo like ${MARCA + '-%'})`
  const contagem = (await execRows(sql`select
    (select count(*) from notas_fiscais_saida where id in ${notas})::int as notas,
    (select count(*) from motos_fiscal where moto_id in ${motos})::int as fichas,
    (select count(*) from vendas where moto_id in ${motos})::int as vendas,
    (select count(*) from pedidos_venda where moto_id in ${motos})::int as pedidos,
    (select count(*) from historico_estoque where moto_id in ${motos})::int as historico,
    (select count(*) from motos where id in ${motos})::int as motos`))[0]
  console.log(`\n▶ Limpeza (marcados ${MARCA}): ${JSON.stringify(contagem)}`)
  await db.transaction(async tx => {
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
  if (cfg.ambiente === 'Producao') throw new Error('o grupo do aux.sul está em produção na Nota Gateway: recuso')
  const c: Ctx = { lojaId: aux.loja_id, grupoId: aux.grupo_id, auxId: aux.id, modeloId: modelo.id, ambiente: cfg.ambiente }

  await mkdir(PASTA, { recursive: true })
  const navegador = await chromium.launch({ headless: !VER, slowMo: VER ? 400 : 0 })
  try {
    for (const caso of CASOS) await semear(c, caso)
    const telas = [
      { nome: 'desktop', opcoes: { viewport: { width: 1440, height: 900 } } },
      { nome: 'celular', opcoes: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ]
    for (const t of telas) {
      console.log(`\n▶ ${t.nome}`)
      const pagina = await (await navegador.newContext({ locale: 'pt-BR', ...t.opcoes })).newPage()
      await entrar(pagina)
      for (const caso of CASOS) await telaDoCaso(pagina, caso, t.nome)
    }
  } catch (e) {
    falhas++
    console.error(e instanceof Error ? e.message : e)
    const pagina = navegador.contexts().at(-1)?.pages()[0]
    if (pagina) {
      const arquivo = `${PASTA}/falha-${Date.now()}.png`
      await pagina.screenshot({ path: arquivo, fullPage: true }).then(() => console.error(`Tela no momento: ${arquivo}`), () => null)
    }
  } finally {
    await navegador.close()
    await limpar().catch(e => { falhas++; console.error(`Limpeza falhou: ${(e as Error).message}`) })
    await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nOk.')
  process.exit(falhas ? 1 : 0)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
