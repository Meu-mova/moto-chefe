/**
 * Matriz rota × papel (#579): entra com cada papel do seed e abre pela URL cada rota da
 * tabela de navegação. Com permissão, a tela abre; sem, volta ao /dashboard sem passar pela
 * tela de erro. Só navega: não preenche nem grava nada.
 *
 *   NAVEGACAO_URL=<url> SMOKE_SENHA=<senha do seed> VERCEL_AUTOMATION_BYPASS_SECRET=<opcional> \
 *     node --import tsx scripts/e2e-acesso-rotas.ts
 *
 * Contra a cópia local da produção, use `npm run e2e:acesso:local` (#594).
 */
import { chromium, type Page } from 'playwright'
import { motivoUrlRecusada } from './lib/smoke'
import { ROTAS_MATRIZ, esperado, falhaDaVisita, usuariosDaMatriz } from './lib/acesso-rotas'

const base = (process.env.NAVEGACAO_URL ?? process.env.SMOKE_URL)?.replace(/\/$/, '')
const senha = process.env.SMOKE_SENHA ?? process.env.SEED_SENHA
if (!base || !senha) {
  console.error('Defina NAVEGACAO_URL e SMOKE_SENHA.')
  process.exit(1)
}
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const recusa = motivoUrlRecusada(base, Boolean(bypass))
if (recusa) {
  console.error(`Recusado: ${recusa}`)
  process.exit(1)
}
const origem = new URL(base).origin
const usuarios = usuariosDaMatriz(process.env.MATRIZ_USUARIOS)
const LIMITE = 30_000

async function entrar(pagina: Page, email: string, rotulo = email) {
  await pagina.goto(`${base}/login`)
  await pagina.fill('#email', email)
  await pagina.fill('#password', senha!)
  await Promise.all([
    pagina.waitForURL(url => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: LIMITE }),
    pagina.click('button[type="submit"]'),
  ])
  if (new URL(pagina.url()).pathname.startsWith('/login')) throw new Error(`login recusado para ${rotulo}`)
}

async function main() {
  const navegador = await chromium.launch()
  let falhas = 0
  try {
    for (const u of usuarios) {
      const contexto = await navegador.newContext({ locale: 'pt-BR' })
      if (bypass) {
        // O bypass vai só nas requisições ao preview, nunca a terceiros (Supabase, vercel.live).
        await contexto.route(url => url.origin === origem, rota =>
          rota.continue({ headers: { ...rota.request().headers(), 'x-vercel-protection-bypass': bypass } }))
      }
      const pagina = await contexto.newPage()
      await entrar(pagina, u.email, u.rotulo)
      console.log(`\n${u.papel} (${u.rotulo ?? u.email})`)
      for (const href of ROTAS_MATRIZ) {
        const esp = esperado(u.papel, href)
        let status: number | null = null
        try {
          status = (await pagina.goto(`${base}${href}`, { timeout: LIMITE }))?.status() ?? null
          await pagina.waitForLoadState('networkidle', { timeout: LIMITE }).catch(() => {})
        } catch { /* sem resposta: status fica null */ }
        const telaDeErro = await pagina.getByText('Erro ao carregar a página').isVisible().catch(() => false)
        const falha = falhaDaVisita(esp, { href, caminhoFinal: new URL(pagina.url()).pathname, status, telaDeErro })
        if (falha) {
          falhas++
          console.log(`  ✗ ${href} (${esp}): ${falha}`)
        } else console.log(`  ✓ ${href} (${esp})`)
      }
      await contexto.close()
    }
  } finally {
    await navegador.close()
  }
  console.log(`\n${falhas === 0 ? 'OK' : `${falhas} falha(s)`}: ${usuarios.length} papéis × ${ROTAS_MATRIZ.length} rotas`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
