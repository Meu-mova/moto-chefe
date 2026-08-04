import { chromium, type BrowserContext, type Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'

export const BASE_COLETOR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'mova-coletor')

export class SessaoExpirada extends Error {
  constructor(public operadora: string) {
    super(`Sessão da ${operadora} expirou — faça login na janela aberta`)
  }
}

export async function abrirPerfil(slugGrupo: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(path.join(BASE_COLETOR, `cartao-${slugGrupo}`), {
    headless: false,
  })
}

/**
 * Captura o cabeçalho Authorization da primeira requisição que a própria página
 * fizer batendo em `padrao`, e devolve junto com a página pronta.
 *
 * Por que assim, e não lendo o token do localStorage: na Stone as chaves do
 * localStorage são ofuscadas e o token não é encontrável por nome. Interceptar
 * o cabeçalho que o app já manda funciona nas três operadoras, sem depender de
 * onde cada uma guarda a credencial.
 */
export async function abrirComToken(
  contexto: BrowserContext,
  url: string,
  padrao: RegExp,
): Promise<{ pagina: Page; authorization: string | null }> {
  const pagina = await contexto.newPage()

  const capturado = pagina.waitForRequest(req => padrao.test(req.url()), { timeout: 30_000 })
    .then(req => req.headers()['authorization'] ?? null)
    .catch(() => null)

  await pagina.goto(url, { waitUntil: 'domcontentloaded' })
  const authorization = await capturado
  return { pagina, authorization }
}

export async function avisar(chatId: string | undefined, texto: string): Promise<void> {
  console.error(texto)
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    })
  } catch (e) {
    console.error('aviso no Telegram falhou:', e instanceof Error ? e.message : String(e))
  }
}
