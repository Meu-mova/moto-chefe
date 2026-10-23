/**
 * Teste de ponta a ponta da #347 (PR 2a) contra o staging: ao abrir "Emitir NF de
 * saída" de uma venda cuja última tentativa foi recusada, o diálogo abre na tela da
 * recusa: a comum oferece "Reenviar nº N"; a denegada (301 e 302) explica a IE
 * irregular e não oferece reenviar o mesmo número. Desktop e celular, com telas em
 * /tmp/e2e-347-pr2/.
 *
 *   E2E_URL=http://localhost:3349 \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-nf-reenvio.ts [--ver]
 *
 * Usa do .env.local (staging): DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SEED_SENHA.
 * Recusa fora do staging. Grava vendas, motos e NFs sintéticas marcadas com E2E347R
 * e apaga tudo no fim. Não envia nem consulta nota: abrir o diálogo só lê a empresa
 * na Nota Gateway (homologação do grupo do aux.sul) para montar a conferência.
 * --ver abre o navegador visível e devagar.
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
type Caso = { sufixo: string; motivo: string; numero: string; venda?: { numero: number; chassi: string } }

const CASOS: Caso[] = [
  { sufixo: 'C', motivo: '225 - Rejeição: Falha no Schema XML da NFe', numero: '9347101' },
  { sufixo: 'E', motivo: '301 - Uso Denegado: Irregularidade fiscal do emitente', numero: '9347102' },
  { sufixo: 'D', motivo: '302 - Uso Denegado: Irregularidade fiscal do destinatário', numero: '9347103' },
]

async function semear(c: Ctx, caso: Caso) {
  const chassi = `${MARCA}${caso.sufixo}${Date.now().toString(36).toUpperCase()}`
  const [moto] = (await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)) as { id: string }[]
  const [pedido] = (await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id)
    values (${moto.id}, ${c.lojaId}, ${c.auxId}) returning id`)) as { id: string }[]
  // NF liberada sem contrato: senão o diálogo para na trava da assinatura.
  const [venda] = (await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, nf_liberada_em)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.auxId}, ${c.auxId}, ${'Cliente ' + MARCA}, '52998224725', 1000, 'pix', now()) returning id, numero`)) as { id: string; numero: number }[]
  await execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, payload)
    values (${venda.id}, ${venda.numero}, ${c.grupoId}, ${`${MARCA}-${caso.sufixo}-${venda.numero}`}, ${c.ambiente}, 'Negada', ${caso.motivo}, ${caso.numero}, '{}'::jsonb)`)
  caso.venda = { numero: venda.numero, chassi }
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

/** Abre "Emitir NF de saída" pela busca de chassi; no celular as ações ficam na gaveta da venda. */
async function abrirNf(pagina: Page, v: { numero: number; chassi: string }) {
  await pagina.goto(`${base}/vendas?q=${v.chassi}`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: `Abrir venda #${v.numero}`, exact: true }).locator('visible=true').first().click()
  await pagina.getByRole('button', { name: 'Emitir NF de saída' }).locator('visible=true').first().click()
}

async function telaDoCaso(pagina: Page, caso: Caso, tela: string) {
  await abrirNf(pagina, caso.venda!)
  const ok = (texto: string | RegExp) => pagina.getByText(texto).first().waitFor({ timeout: 30_000 }).then(() => true, () => false)
  const reenviar = pagina.getByRole('button', { name: `Reenviar nº ${caso.numero}` })
  if (caso.sufixo === 'C') {
    confere(await ok(`A SEFAZ recusou a nota nº ${caso.numero}`), `${tela}: título da recusa comum com o número`)
    confere(await ok('sai de novo com o mesmo número'), `${tela}: explica que reenvia com o mesmo número`)
    confere(await reenviar.count() === 1, `${tela}: botão "Reenviar nº ${caso.numero}"`)
  } else {
    const quem = caso.sufixo === 'E' ? 'da empresa' : 'do comprador'
    confere(await ok(`A SEFAZ denegou a nota nº ${caso.numero}`), `${tela}: título da denegada ${caso.motivo.slice(0, 3)}`)
    confere(await ok(`A Inscrição Estadual ${quem} está irregular`), `${tela}: aponta a IE ${quem}`)
    confere(await ok('a próxima sai com número novo'), `${tela}: avisa que a próxima sai com número novo`)
    confere(await reenviar.count() === 0, `${tela}: sem "Reenviar nº ${caso.numero}"`)
  }
  await pagina.screenshot({ path: `${PASTA}/${tela}-${caso.sufixo}.png`, fullPage: true })
}

async function limpar() {
  const motos = sql`(select id from motos where chassi like ${MARCA + '%'})`
  const notas = sql`(select id from notas_fiscais_saida where id_externo like ${MARCA + '-%'})`
  const contagem = (await execRows(sql`select
    (select count(*) from notas_fiscais_saida where id in ${notas})::int as notas,
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
