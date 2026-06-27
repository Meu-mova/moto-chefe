const BASE = 'https://motochefebrasil.store'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Extrai cookies de um response de forma compatível com Node 18+
function extractCookies(headers: Headers): string[] {
  // Tenta getSetCookie (Node 18.14+ / undici)
  try {
    const fn = (headers as any).getSetCookie
    if (typeof fn === 'function') {
      const result = fn.call(headers)
      if (Array.isArray(result) && result.length > 0) return result
    }
  } catch {}

  // Fallback: raw string — pode ser múltiplos cookies concatenados com ", "
  const raw = headers.get('set-cookie')
  if (!raw) return []

  // Split conservador: divide apenas quando encontra "<nome>=" após a vírgula
  const parts: string[] = []
  let current = ''
  for (const segment of raw.split(',')) {
    if (current && /^\s*[a-zA-Z_][a-zA-Z0-9_-]*=/.test(segment)) {
      parts.push(current.trim())
      current = segment
    } else {
      current += (current ? ',' : '') + segment
    }
  }
  if (current) parts.push(current.trim())
  return parts
}

function mergeCookies(existing: string, fresh: string[]): string {
  const map = new Map<string, string>()
  if (existing) {
    for (const pair of existing.split(';').map(s => s.trim()).filter(Boolean)) {
      const idx = pair.indexOf('=')
      if (idx > 0) map.set(pair.substring(0, idx).trim(), pair.substring(idx + 1))
    }
  }
  for (const header of fresh) {
    const nameValue = header.split(';')[0].trim()
    const idx = nameValue.indexOf('=')
    if (idx > 0) map.set(nameValue.substring(0, idx).trim(), nameValue.substring(idx + 1))
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export type FabricaSession = { cookie: string }

export async function loginFabrica(): Promise<FabricaSession> {
  const email = process.env.FABRICA_EMAIL
  const senha = process.env.FABRICA_SENHA
  if (!email || !senha) throw new Error('Variáveis FABRICA_EMAIL / FABRICA_SENHA não configuradas no ambiente')

  // 1. GET /login (sem redirect automático para capturar Set-Cookie)
  const getResp = await fetch(`${BASE}/login`, {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  })

  // Se redirecionou para /clientes, a sessão já está ativa (não deve acontecer no servidor)
  let html: string
  let cookie = mergeCookies('', extractCookies(getResp.headers))

  if (getResp.status === 302 || getResp.status === 301) {
    // Segue o redirect manualmente
    const location = getResp.headers.get('location') ?? `${BASE}/login`
    const followResp = await fetch(location.startsWith('http') ? location : `${BASE}${location}`, {
      headers: { 'Cookie': cookie, 'User-Agent': UA },
      redirect: 'manual',
    })
    cookie = mergeCookies(cookie, extractCookies(followResp.headers))
    html = await followResp.text()
  } else {
    html = await getResp.text()
  }

  const csrfToken = html.match(/name="csrf_test_name"[^>]*value="([^"]+)"/i)?.[1]
  if (!csrfToken) throw new Error('CSRF token não encontrado. O site pode ter mudado ou o login falhou.')

  // 2. POST /login
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

  const postCookies = extractCookies(postResp.headers)
  const authCookie = mergeCookies(cookie, postCookies)

  const location = postResp.headers.get('location') ?? ''
  const loginOk =
    postResp.status === 302 ||
    postResp.status === 303 ||
    location.includes('/clientes')

  if (!loginOk) {
    throw new Error(`Login falhou — status ${postResp.status}, location: "${location}"`)
  }

  // 3. Segue redirect para /clientes para finalizar a sessão
  const destino = location.startsWith('http') ? location : `${BASE}${location}`
  const homeResp = await fetch(destino, {
    headers: { 'Cookie': authCookie, 'User-Agent': UA },
    redirect: 'manual',
  })
  const finalCookie = mergeCookies(authCookie, extractCookies(homeResp.headers))

  // Verifica se está autenticado acessando uma página protegida
  const checkResp = await fetch(`${BASE}/clientes`, {
    headers: { 'Cookie': finalCookie, 'User-Agent': UA },
    redirect: 'manual',
  })
  if (checkResp.status === 302) {
    throw new Error('Login falhou — sessão não autenticada após POST (possível credencial inválida)')
  }

  return { cookie: finalCookie }
}

// "25/06/2026 11:57" → "2026-06-25"
function parseFabricaDate(dateStr: string): string {
  const [datePart] = dateStr.trim().split(' ')
  const [day, month, year] = datePart.split('/')
  return `${year}-${month}-${day}`
}

export async function listarPedidosGarantiaFabrica(
  session: FabricaSession,
): Promise<{ numeroPedido: string; dataAbertura: string }[]> {
  const resp = await fetch(`${BASE}/clientes/trocas`, {
    headers: { 'Cookie': session.cookie, 'User-Agent': UA },
  })
  const html = await resp.text()

  // Extrai números de pedido pelos links para /trocas/detalhes/NUMBER
  const numerosLinks = [...html.matchAll(/\/trocas\/detalhes\/(\d+)/g)].map(m => m[1])
  const numeros = [...new Set(numerosLinks)]

  // Extrai todas as datas no formato DD/MM/YYYY HH:MM presentes na página
  const datas = [...html.matchAll(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/g)].map(m => m[1])

  console.log('[fabrica-v2] status:', resp.status, '| numeros:', numeros.slice(0, 5), '| datas:', datas.slice(0, 3))
  // Contexto ao redor de "detalhes" para ver o padrão de URL real
  const idxDet = html.indexOf('detalhes')
  if (idxDet >= 0) console.log('[fabrica-v2] ctx detalhes:', JSON.stringify(html.substring(idxDet - 50, idxDet + 80)))
  else console.log('[fabrica-v2] "detalhes" NÃO encontrado no HTML')

  return numeros.map((num, i) => ({
    numeroPedido: num,
    dataAbertura: datas[i] ? parseFabricaDate(datas[i]) : new Date().toISOString().split('T')[0],
  }))
}

export async function buscarDetalhePedidoGarantia(
  session: FabricaSession,
  numeroPedido: string,
): Promise<{ chassi: string | null; peca: string | null; status: string | null }> {
  const resp = await fetch(`${BASE}/clientes/trocas/detalhes/${numeroPedido}`, {
    headers: { 'Cookie': session.cookie, 'User-Agent': UA },
    redirect: 'follow',
  })
  const html = await resp.text()

  const chassi = html
    .match(/<p class="text-gray-400 text-sm">Chassi<\/p>\s*<p class="text-white">([^<]+)<\/p>/)?.[1]
    ?.trim() ?? null

  const peca = html
    .match(/<h3 class="text-white font-semibold text-lg mb-2">\s*([^<]+?)\s*<\/h3>/)?.[1]
    ?.trim() ?? null

  const status = html
    .match(/rounded-lg text-sm font-semibold[^>]*>\s*([^<\n]+?)\s*<\/span>/)?.[1]
    ?.trim() ?? null

  return { chassi, peca, status }
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

  // Se redirecionou para login, sessão expirou
  if (html.includes('Faça login') || html.includes('/login')) return null

  // Badge: <span class="inline-flex px-6 py-2.5 rounded-lg text-sm font-semibold ...">STATUS</span>
  const match = html.match(/rounded-lg text-sm font-semibold[^>]*>\s*([^<\n]+?)\s*<\/span>/)
  return match?.[1]?.trim() ?? null
}
