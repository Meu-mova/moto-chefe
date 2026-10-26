/**
 * Teste de navegação (#393): entra com o geral@ do seed numa largura de tela e, no tema claro e
 * depois no escuro, abre o menu e clica em cada item (inclusive os de dentro dos grupos). Cada
 * tela precisa abrir sem 5xx, erro no console, exceção ou queda no /login; no escuro, nenhum
 * elemento grande pode ter fundo claro, nem no esqueleto de carregamento nem depois. Só navega:
 * não preenche nem grava nada.
 *
 *   NAVEGACAO_URL=<url> SMOKE_SENHA=<senha do seed> VERCEL_AUTOMATION_BYPASS_SECRET=<opcional> \
 *     node --import tsx scripts/navegacao-ci.ts --largura 390 [--prints <pasta>]
 *
 * Enquanto o tema escuro não está ligado (fase 5 da #90), o escuro é forçado como no
 * scripts/e2e-tema.ts: classe "dark" no <html>.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { DOMINIO_TESTE } from './lib/seed-dados'
import { motivoUrlRecusada, motivosDeFalha, type Visita } from './lib/smoke'
import {
  ALTURA_POR_LARGURA, LARGURAS, TEMAS, fundosClarosGrandes, menuNoHamburguer, nomePrint,
  type CaixaComFundo, type Largura, type Tema,
} from './lib/navegacao-ci'

const arg = (nome: string) => { const i = process.argv.indexOf(nome); return i >= 0 ? process.argv[i + 1] : undefined }
const base = (process.env.NAVEGACAO_URL ?? process.env.SMOKE_URL)?.replace(/\/$/, '')
const senha = process.env.SMOKE_SENHA ?? process.env.SEED_SENHA
const largura = Number(arg('--largura')) as Largura
const pastaPrints = arg('--prints') ?? '/tmp/navegacao-ci'
if (!base || !senha || !LARGURAS.includes(largura)) {
  console.error(`Defina NAVEGACAO_URL e SMOKE_SENHA, e --largura ${LARGURAS.join('|')}.`)
  process.exit(1)
}
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const recusa = motivoUrlRecusada(base, Boolean(bypass))
if (recusa) {
  console.error(`Recusado: ${recusa}`)
  process.exit(1)
}
const origem = new URL(base).origin
const tela = { largura, altura: ALTURA_POR_LARGURA[largura] }
const hamburguer = menuNoHamburguer(largura)
// Carregamento que passa disso é falha por si: a tela travou no esqueleto.
const LIMITE_CARREGAR = 30_000

/** Classe "dark" no <html> também nas recargas completas (o next-themes reaplicaria o claro). */
async function aplicarTema(contexto: BrowserContext, pagina: Page, tema: Tema) {
  const script = `(() => { const h = document.documentElement; const escuro = ${tema === 'escuro'};
    h.classList.toggle('dark', escuro); h.classList.toggle('light', !escuro); h.style.colorScheme = escuro ? 'dark' : 'light' })()`
  await contexto.addInitScript(script)
  await pagina.evaluate(script)
}

// Em string: o tsx põe __name nas funções declaradas aqui dentro, que não existe no navegador.
const MEDIR_FUNDOS = `(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  return [...document.querySelectorAll('main *, main')].flatMap((el) => {
    const bg = getComputedStyle(el).backgroundColor
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return []
    const ret = el.getBoundingClientRect()
    if (ret.width === 0 || ret.height === 0) return []
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [{ html: el.outerHTML.slice(0, 120), r, g, b, a, largura: ret.width, altura: ret.height }]
  })
})()`

async function fundosClaros(pagina: Page): Promise<string[]> {
  const caixas = await pagina.evaluate(MEDIR_FUNDOS) as CaixaComFundo[]
  return fundosClarosGrandes(caixas, tela).map(c => `fundo claro: ${c.html}`)
}

async function entrar(pagina: Page) {
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', `geral@${DOMINIO_TESTE}`)
  await pagina.fill('#password', senha!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
  const destino = new URL(pagina.url())
  if (destino.pathname.startsWith('/login')) throw new Error(`login recusado (${destino.searchParams.get('error')})`)
  await pagina.waitForLoadState('load')
}

/** Abre o menu (hambúrguer no celular/tablet) e expande todos os grupos; devolve o <nav>. */
async function abrirMenu(pagina: Page) {
  if (hamburguer) {
    // O menu fecha sozinho ao navegar; clicar durante a animação de fechar não acha o link.
    await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 })
    await pagina.getByRole('button', { name: 'Abrir menu' }).click()
  }
  const nav = hamburguer ? pagina.getByRole('dialog').locator('nav') : pagina.locator('aside nav')
  await nav.waitFor()
  // O grupo aberto sai da lista: clica sempre no primeiro fechado.
  const fechados = nav.locator('button[aria-expanded="false"]')
  while (await fechados.count() > 0) await fechados.first().click()
  return nav
}

async function fecharMenu(pagina: Page) {
  if (hamburguer) {
    await pagina.keyboard.press('Escape')
    await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 })
  }
}

/** Espera a tela terminar: rede parada e nenhum esqueleto (animate-pulse) na tela. */
async function esperarCarregar(pagina: Page) {
  await pagina.waitForLoadState('networkidle', { timeout: LIMITE_CARREGAR }).catch(() => {})
  await pagina.waitForFunction(() => !document.querySelector('main [class*="animate-pulse"]'), null, { timeout: LIMITE_CARREGAR })
}

// Visita em andamento: os ouvintes da página (registrados uma vez em main) anotam nela.
let visita: Visita | null = null

async function percorrer(contexto: BrowserContext, pagina: Page, tema: Tema): Promise<number> {
  await aplicarTema(contexto, pagina, tema)
  const nav = await abrirMenu(pagina)
  const todos = [...new Set(await nav.locator('a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')!)))]
  // A tela atual vai para o fim: clicar no link dela não navega.
  const atual = new URL(pagina.url()).pathname
  const hrefs = [...todos.filter(h => h !== atual), ...todos.filter(h => h === atual)]
  if (hrefs.at(-1) === atual) hrefs.pop()
  await fecharMenu(pagina)
  console.log(`\n${tema} ${largura}px: ${hrefs.length} itens no menu`)

  let falhas = 0

  for (const [i, href] of hrefs.entries()) {
    // Navegação do lado do cliente não tem status de documento; 5xx vem das respostas (RSC).
    const v: Visita = { tela: href, status: 200, caminhoFinal: href, respostas5xx: [], errosConsole: [], errosPagina: [] }
    const extras: string[] = []
    const inicio = Date.now()
    try {
      const menu = await abrirMenu(pagina)
      const anterior = new URL(pagina.url()).pathname
      visita = v
      await menu.locator(`a[href="${href}"]`).first().click({ timeout: 10_000 })
      if (tema === 'escuro') {
        // Logo após o clique: o esqueleto aparece ou a tela já trocou.
        await pagina.waitForFunction(
          (destino) => !!document.querySelector('main [class*="animate-pulse"]') || location.pathname === destino,
          href, { timeout: LIMITE_CARREGAR, polling: 'raf' },
        )
        extras.push(...(await fundosClaros(pagina)).map(m => `esqueleto: ${m}`))
        await pagina.screenshot({ path: join(pastaPrints, nomePrint(tema, largura, i + 1, href, 'esqueleto')) })
      }
      // A tela anterior já está parada: sem esperar a URL trocar, mediria a tela errada.
      await pagina.waitForURL(url => url.pathname !== anterior, { timeout: LIMITE_CARREGAR })
      await esperarCarregar(pagina)
      v.caminhoFinal = new URL(pagina.url()).pathname
      if (tema === 'escuro') extras.push(...await fundosClaros(pagina))
      await pagina.screenshot({ path: join(pastaPrints, nomePrint(tema, largura, i + 1, href, 'carregada')), fullPage: true })
    } catch (e) {
      v.errosPagina.push(`navegação: ${(e as Error).message.split('\n')[0]}`)
      v.caminhoFinal = new URL(pagina.url()).pathname
    }
    visita = null
    const motivos = [...motivosDeFalha(v), ...extras]
    const tempo = `${((Date.now() - inicio) / 1000).toFixed(1)} s`
    if (motivos.length === 0) console.log(`  ✓ ${href} (${tempo})`)
    else {
      falhas++
      console.log(`  ✗ ${href} (${tempo})`)
      for (const m of motivos) console.log(`      ${m}`)
    }
  }
  return falhas
}

async function main() {
  mkdirSync(pastaPrints, { recursive: true })
  const navegador = await chromium.launch()
  let falhas = 0
  try {
    const contexto = await navegador.newContext({ locale: 'pt-BR', viewport: { width: tela.largura, height: tela.altura } })
    if (bypass) {
      // O bypass vai só nas requisições ao preview, nunca a terceiros (Supabase, vercel.live).
      await contexto.route(url => url.origin === origem, rota =>
        rota.continue({ headers: { ...rota.request().headers(), 'x-vercel-protection-bypass': bypass } }))
    }
    const pagina = await contexto.newPage()
    pagina.on('console', m => { if (visita && m.type() === 'error') visita.errosConsole.push(m.text().slice(0, 200)) })
    pagina.on('pageerror', e => visita?.errosPagina.push(e.message.slice(0, 200)))
    pagina.on('response', r => {
      const u = new URL(r.url())
      if (visita && r.status() >= 500 && u.origin === origem) visita.respostas5xx.push(`${r.request().method()} ${u.pathname} ${r.status()}`)
    })
    await entrar(pagina)
    for (const tema of TEMAS) falhas += await percorrer(contexto, pagina, tema)
  } finally {
    await navegador.close()
  }
  console.log(falhas === 0 ? `\nNavegação ok (${largura}px).` : `\nNavegação falhou em ${falhas} tela(s) (${largura}px).`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(`Navegação quebrou: ${(e as Error).message}`)
  process.exit(1)
})
