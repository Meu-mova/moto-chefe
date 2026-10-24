/**
 * Capturas e contraste das telas nos temas claro e escuro (#90), contra o staging.
 *
 *   E2E_URL=http://localhost:3390 E2E_PASTA=$HOME/.../tema-90-capturas/<pr> \
 *     npx dotenv-cli -e .env.local -- node --import tsx scripts/e2e-tema.ts <usuario> <rota>... [--ver]
 *
 * <usuario> é o prefixo do login de teste (geral, aux.sul...). Cada rota sai em 2 temas x
 * desktop e 390px, com o axe (regra color-contrast). Enquanto o tema está forçado claro, o
 * escuro é aplicado pondo a classe "dark" no <html>, como o next-themes faz.
 * Só lê telas: não cria nem altera dado.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { motivoRecusaForaDoStaging } from './lib/alvo-banco'
import { motivoRecusa } from './lib/e2e-mensalidade'

const base = (process.env.E2E_URL ?? 'http://localhost:3390').replace(/\/$/, '')
const pasta = process.env.E2E_PASTA ?? '/tmp/e2e-tema'
const [usuario, ...rotas] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const recusa = motivoRecusa({ url: base, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, databaseUrl: process.env.DATABASE_URL })
  ?? motivoRecusaForaDoStaging(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)
if (recusa || !process.env.SEED_SENHA || !usuario || rotas.length === 0) {
  console.error(recusa ? `Recusado: ${recusa}` : 'Uso: e2e-tema.ts <usuario> <rota>... (e SEED_SENHA no env)')
  process.exit(1)
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, celular: { width: 390, height: 844 } }

async function rodar(navegador: Browser) {
  let violacoes = 0
  const lista: { tela: string; alvo: string; html: string; mensagem: string }[] = []
  for (const [nomeVp, viewport] of Object.entries(VIEWPORTS)) {
    const contexto = await navegador.newContext({ locale: 'pt-BR', viewport })
    const pagina = await contexto.newPage()
    await pagina.goto(`${base}/login`)
    await pagina.fill('#email', `${usuario}@teste.meumova.com`)
    await pagina.fill('#password', process.env.SEED_SENHA!)
    await Promise.all([
      pagina.waitForURL((url) => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
      pagina.click('button[type="submit"]'),
    ])
    if (new URL(pagina.url()).pathname.startsWith('/login')) throw new Error(`login falhou para ${usuario}`)
    for (const rota of rotas) {
      await pagina.goto(`${base}${rota}`, { waitUntil: 'networkidle' })
      for (const tema of ['claro', 'escuro'] as const) {
        await pagina.evaluate((escuro) => {
          document.documentElement.classList.toggle('dark', escuro)
          document.documentElement.classList.toggle('light', !escuro)
          document.documentElement.style.colorScheme = escuro ? 'dark' : 'light'
        }, tema === 'escuro')
        const nome = `${rota.replace(/^\//, '').replace(/[/?=&]/g, '_') || 'inicio'}-${tema}-${nomeVp}`
        await pagina.screenshot({ path: `${pasta}/${nome}.png`, fullPage: true })
        const { violations } = await new AxeBuilder({ page: pagina }).withRules(['color-contrast']).analyze()
        const nos = violations.flatMap((v) => v.nodes)
        violacoes += nos.length
        for (const n of nos) lista.push({ tela: nome, alvo: n.target.join(' '), html: n.html, mensagem: n.any[0]?.message ?? '' })
        console.log(`${nos.length ? 'FALHA' : 'ok   '} ${nome}${nos.length ? `: ${nos.length} contraste` : ''}`)
        for (const n of nos.slice(0, 5)) console.log(`        ${n.target.join(' ')} ${n.any[0]?.message ?? ''}`)
      }
    }
    await contexto.close()
  }
  // Lista inteira, para provar que nenhuma violação vem dos arquivos que o PR tocou.
  writeFileSync(`${pasta}/axe.json`, JSON.stringify(lista, null, 2))
  return violacoes
}

async function main() {
  mkdirSync(pasta, { recursive: true })
  const navegador = await chromium.launch({ headless: !process.argv.includes('--ver') })
  try {
    const violacoes = await rodar(navegador)
    console.log(`\nCapturas em ${pasta}. Violações de contraste: ${violacoes}`)
    process.exitCode = violacoes ? 1 : 0
  } finally {
    await navegador.close()
  }
}

main()
