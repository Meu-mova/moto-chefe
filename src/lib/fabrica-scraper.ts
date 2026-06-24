const BASE = 'https://motochefebrasil.store'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function mergeCookies(existing: string, fresh: string[]): string {
  const map = new Map<string, string>()
  for (const pair of existing.split(';').map(s => s.trim()).filter(Boolean)) {
    const [k, v] = pair.split('=')
    if (k) map.set(k.trim(), v ?? '')
  }
  for (const header of fresh) {
    const pair = header.split(';')[0].trim()
    const [k, v] = pair.split('=')
    if (k) map.set(k.trim(), v ?? '')
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export type FabricaSession = { cookie: string }

export async function loginFabrica(): Promise<FabricaSession> {
  const email = process.env.FABRICA_EMAIL
  const senha = process.env.FABRICA_SENHA
  if (!email || !senha) throw new Error('FABRICA_EMAIL / FABRICA_SENHA não configurados')

  // 1. GET para pegar CSRF token e cookie inicial
  const getResp = await fetch(`${BASE}/login`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  const html = await getResp.text()
  const csrfToken = html.match(/name="csrf_test_name"[^>]*value="([^"]+)"/i)?.[1]
  if (!csrfToken) throw new Error('CSRF token não encontrado na página de login')

  const getSetCookies = (getResp.headers as any).getSetCookie?.() ?? []
  let cookie = mergeCookies('', getSetCookies)

  // 2. POST login
  const body = new URLSearchParams({ email, senha, csrf_test_name: csrfToken })
  const postResp = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'User-Agent': UA,
      'Referer': `${BASE}/login`,
    },
    body: body.toString(),
    redirect: 'manual',
  })

  const postSetCookies = (postResp.headers as any).getSetCookie?.() ?? []
  cookie = mergeCookies(cookie, postSetCookies)

  // Verifica se logou (redireciona para /clientes)
  const location = postResp.headers.get('location') ?? ''
  if (!location.includes('/clientes') && postResp.status !== 302 && postResp.status !== 301) {
    throw new Error(`Login falhou (status ${postResp.status})`)
  }

  return { cookie }
}

export async function buscarStatusGarantiaFabrica(
  session: FabricaSession,
  numeroPedido: string,
): Promise<string | null> {
  const resp = await fetch(`${BASE}/clientes/trocas/detalhes/${numeroPedido}`, {
    headers: { 'Cookie': session.cookie, 'User-Agent': UA },
    redirect: 'follow',
  })

  if (!resp.ok) return null

  const html = await resp.text()

  // Badge principal: <span class="inline-flex px-6 py-2.5 rounded-lg text-sm font-semibold ...">STATUS</span>
  const match = html.match(/rounded-lg text-sm font-semibold[^>]*>\s*([^<\n]+?)\s*<\/span>/)
  return match?.[1]?.trim() ?? null
}

// Varre todas as páginas e retorna mapa numeroPedido -> status
export async function varrerGarantiasFabrica(
  session: FabricaSession,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  let page = 1

  while (true) {
    const resp = await fetch(
      `${BASE}/clientes/pedidos?aba=garantias&page=${page}`,
      { headers: { 'Cookie': session.cookie, 'User-Agent': UA } },
    )
    if (!resp.ok) break
    const html = await resp.text()

    // Extrai linhas da tabela: #ID | ... | STATUS | ...
    const rowPattern = /font-mono">\s*#(\d+)\s*<\/td>[\s\S]*?rounded-full[^>]*>\s*([^<]+?)\s*<\/span>/g
    let match
    let found = 0
    while ((match = rowPattern.exec(html)) !== null) {
      mapa.set(match[1], match[2].trim())
      found++
    }

    // Verifica se tem próxima página
    if (found === 0 || !html.includes(`page=${page + 1}`)) break
    page++
  }

  return mapa
}
