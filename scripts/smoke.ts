/**
 * Smoke do preview (fase 10; D17): login com os usuários sintéticos do seed e visita
 * às telas principais. Só navega: não preenche nem confirma formulário.
 *
 *   SMOKE_URL=<url do preview> SMOKE_SENHA=<senha do seed> \
 *   VERCEL_AUTOMATION_BYPASS_SECRET=<opcional> node --import tsx scripts/smoke.ts
 *
 * Sai com código 1 se alguma tela falhar (regras em scripts/lib/smoke.ts).
 */
import { chromium, type Browser, type BrowserContext } from 'playwright'
import { motivoUrlRecusada, motivosDeFalha, USUARIOS_SMOKE, type Visita } from './lib/smoke'

const base = process.env.SMOKE_URL?.replace(/\/$/, '')
const senha = process.env.SMOKE_SENHA
if (!base || !senha) {
  console.error('Defina SMOKE_URL e SMOKE_SENHA.')
  process.exit(1)
}
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const recusa = motivoUrlRecusada(base, Boolean(bypass))
if (recusa) {
  console.error(`Recusado: ${recusa}`)
  process.exit(1)
}
const origem = new URL(base).origin

/** O bypass vai só nas requisições ao preview, nunca a terceiros (Supabase, vercel.live). */
async function novoContexto(navegador: Browser): Promise<BrowserContext> {
  const contexto = await navegador.newContext()
  if (bypass) {
    await contexto.route(url => url.origin === origem, rota =>
      rota.continue({ headers: { ...rota.request().headers(), 'x-vercel-protection-bypass': bypass } }))
  }
  return contexto
}

async function entrar(contexto: BrowserContext, email: string): Promise<string | null> {
  const pagina = await contexto.newPage()
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 30_000 }),
    pagina.click('button[type="submit"]'),
  ])
  const destino = new URL(pagina.url())
  await pagina.close()
  if (destino.pathname.startsWith('/login')) return `login recusado (${destino.searchParams.get('error')})`
  // Primeiro acesso pendente trava o usuário fora das telas: o seed deveria evitar.
  if (destino.pathname !== '/dashboard') return `login levou a ${destino.pathname}`
  return null
}

async function visitar(contexto: BrowserContext, tela: string): Promise<Visita> {
  const pagina = await contexto.newPage()
  const visita: Visita = { tela, status: null, caminhoFinal: tela, respostas5xx: [], errosConsole: [], errosPagina: [] }
  pagina.on('console', m => { if (m.type() === 'error') visita.errosConsole.push(m.text().slice(0, 200)) })
  pagina.on('pageerror', e => visita.errosPagina.push(e.message.slice(0, 200)))
  pagina.on('response', r => {
    const u = new URL(r.url())
    if (r.status() >= 500 && u.origin === origem) visita.respostas5xx.push(`${r.request().method()} ${u.pathname} ${r.status()}`)
  })
  try {
    const resposta = await pagina.goto(`${base}${tela}`, { waitUntil: 'load', timeout: 45_000 })
    visita.status = resposta?.status() ?? null
    // Tempo para os componentes de cliente montarem e as buscas iniciais terminarem.
    await pagina.waitForTimeout(2_000)
    visita.caminhoFinal = new URL(pagina.url()).pathname
  } catch (e) {
    visita.errosPagina.push(`navegação: ${(e as Error).message.split('\n')[0]}`)
  }
  await pagina.close()
  return visita
}

async function main() {
  const navegador = await chromium.launch()
  let falhas = 0
  try {
    for (const usuario of USUARIOS_SMOKE) {
      const contexto = await novoContexto(navegador)
      console.log(`\n${usuario.email}`)
      const erroLogin = await entrar(contexto, usuario.email)
      if (erroLogin) {
        console.log(`  ✗ ${erroLogin}`)
        falhas += usuario.telas.length
      } else {
        for (const tela of usuario.telas) {
          let motivos = motivosDeFalha(await visitar(contexto, tela))
          // Uma 2ª tentativa separa engasgo do staging (500 passageiro) de tela quebrada de fato.
          if (motivos.length > 0) {
            console.log(`  … ${tela} falhou, tentando de novo em 10 s`)
            await new Promise(r => setTimeout(r, 10_000))
            motivos = motivosDeFalha(await visitar(contexto, tela))
          }
          if (motivos.length === 0) console.log(`  ✓ ${tela}`)
          else {
            falhas++
            console.log(`  ✗ ${tela}`)
            for (const m of motivos) console.log(`      ${m}`)
          }
        }
      }
      await contexto.close()
    }
  } finally {
    await navegador.close()
  }
  console.log(falhas === 0 ? '\nSmoke ok.' : `\nSmoke falhou em ${falhas} tela(s).`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(`Smoke quebrou: ${(e as Error).message}`)
  process.exit(1)
})
