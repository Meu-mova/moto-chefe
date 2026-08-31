import { hojeBrt } from './data-venda'
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

export type CredencialFabrica = { email: string; senha: string }

/**
 * Faz login no portal da fábrica com a conta de uma loja.
 *
 * A credencial é obrigatória: cada loja tem seu próprio cadastro no portal e o
 * que uma conta enxerga não é o que a outra enxerga. Sem argumento não há como
 * saber de qual loja é a sessão — por isso não existe mais fallback de ambiente.
 */
export async function loginFabrica(cred: CredencialFabrica): Promise<FabricaSession> {
  const email = cred.email?.trim()
  const senha = cred.senha?.trim()
  if (!email || !senha) throw new Error('Login da fábrica sem e-mail ou senha — confira o cadastro da loja')

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

  // Sessão expirada volta o formulário de login com HTTP 200 — uma aba de
  // trocas legitimamente vazia não tem esse formulário, só a lista (vazia ou não).
  if (/name="csrf_test_name"/i.test(html) && !/\/trocas\/detalhes\//.test(html)) {
    throw new Error('Sessão da fábrica expirou antes de listar as garantias')
  }

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
    dataAbertura: datas[i] ? parseFabricaDate(datas[i]) : hojeBrt(),
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

// ─── Pedidos de compra ────────────────────────────────────────────────────────

export const STATUS_AGUARDANDO_PAGAMENTO = 'Aguardando pagamento'

export type PedidoCompraFabrica = {
  numeroPedido: string
  /** "29/07/2026 18:17" como vem do portal */
  dataPedido: string | null
  valor: number | null
  metodo: string | null
  status: string | null
}

function limparHtml(trecho: string): string {
  return trecho
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// "R$ 202,90" → 202.9 ; "R$ 1.234,56" → 1234.56
function parseValorBR(texto: string): number | null {
  const m = texto.match(/R\$\s*([\d.]+,\d{2})/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Extrai os pedidos da tabela de /clientes/pedidos.
 *
 * Puro de propósito — é o que o teste cobre, já que o HTML do portal é de
 * terceiro e pode mudar sem aviso. Não assume ordem de coluna: acha cada campo
 * pelo formato (link do pedido, data dd/mm/aaaa, valor em R$, badge de status),
 * porque a mesma tabela serve as abas de compras e de garantias.
 */
export function parsearPedidosCompra(html: string): PedidoCompraFabrica[] {
  const linhas = html.split(/<tr\b/i).slice(1)
  const pedidos: PedidoCompraFabrica[] = []
  const vistos = new Set<string>()

  for (const linha of linhas) {
    const numeroPedido = linha.match(/\/clientes\/pedido\/(\d+)/)?.[1]
    if (!numeroPedido || vistos.has(numeroPedido)) continue
    vistos.add(numeroPedido)

    const celulas = [...linha.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limparHtml(m[1]))

    const dataPedido = celulas.find(c => /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/.test(c)) ?? null
    const celulaValor = celulas.find(c => /R\$/.test(c))
    const status = limparHtml(linha.match(/<span\b[^>]*rounded-full[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '') || null

    // O método de pagamento é a célula curta que não é número, data nem status.
    const metodo = celulas.find(c =>
      c.length > 0 && c.length <= 20 &&
      c !== status &&
      !/R\$|\d{2}\/\d{2}\/\d{4}|^#?\d+$/.test(c) &&
      !/detalhes/i.test(c),
    ) ?? null

    pedidos.push({
      numeroPedido,
      dataPedido,
      valor: celulaValor ? parseValorBR(celulaValor) : null,
      metodo,
      status,
    })
  }

  return pedidos
}

/**
 * Pedidos de compra da bandeira, opcionalmente filtrados por status.
 *
 * O filtro é server-side (querystring do próprio portal), então uma requisição
 * basta — sem o filtro seriam ~36 páginas de histórico.
 */
export async function listarPedidosCompraFabrica(
  session: FabricaSession,
  status?: string,
): Promise<PedidoCompraFabrica[]> {
  const url = new URL(`${BASE}/clientes/pedidos`)
  url.searchParams.set('aba', 'compras')
  if (status) url.searchParams.set('status', status)

  const resp = await fetch(url.toString(), {
    headers: { 'Cookie': session.cookie, 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Portal da fábrica respondeu ${resp.status} em /clientes/pedidos`)

  const html = await resp.text()
  // Sessão expirada volta o formulário de login com HTTP 200.
  if (/name="csrf_test_name"/i.test(html) && !/\/clientes\/pedido\//.test(html)) {
    throw new Error('Sessão da fábrica expirou antes de listar os pedidos')
  }

  return parsearPedidosCompra(html)
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

// ─── Detalhe do pedido de compra (peças) ──────────────────────────────────────

/** Status de um pedido de compra cuja peça a fábrica já separou. */
export const STATUS_SEPARADO = 'Separado'

/**
 * Peça separada e já conferida — também está pronta para retirar no galpão.
 *
 * Não consta no <select> de status do portal (lá o parecido é "Em conferência"),
 * mas o filtro da querystring aceita o texto e devolve certo; status inexistente
 * devolve lista vazia, então não há risco de cair na lista inteira.
 */
export const STATUS_CONFERIDO = 'Conferido'

/** Status em que a peça já está pronta para retirar. */
export const STATUS_PRONTOS_RETIRADA = [STATUS_SEPARADO, STATUS_CONFERIDO]

export type ItemPedidoCompra = {
  peca: string
  /** Quantidade pedida, ou null se o portal não a expôs. */
  quantidade: number | null
  /** "Categoria" do item no portal — costuma ser o modelo (ex.: "JET"). */
  categoria: string | null
}

export type DetalheCompraFabrica = {
  /** "Retirada na Loja" | "Correios" | ... como vem do portal. */
  tipoEntrega: string | null
  itens: ItemPedidoCompra[]
}

/** A peça é retirada em mãos (não vai pelos Correios) — a que se pega no galpão. */
export function ehRetiradaNaLoja(tipoEntrega: string | null): boolean {
  return /retirada/i.test(tipoEntrega ?? '')
}

/**
 * Extrai tipo de entrega e itens do detalhe de /clientes/pedido/N.
 *
 * Puro de propósito — é o que o teste cobre, já que o HTML é de terceiro. Cada
 * item é um <h3> (nome da peça) seguido logo abaixo por "Quantidade: N"; ancorar
 * na dupla h3+Quantidade ignora <h3> de título ou de outras seções da página.
 */
export function parsearDetalheCompra(html: string): DetalheCompraFabrica {
  const tipoEntrega = html
    .match(/Tipo de Entrega:\s*<\/label>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i)?.[1]
    ?.trim() ?? null

  const itens: ItemPedidoCompra[] = []
  // Nem o nome (grupo 1) nem o gap até "Quantidade" (grupo 2) podem cruzar outro
  // <h3>, senão o <h3> de um título (sem Quantidade abaixo) se estenderia por
  // backtracking até casar a Quantidade do item seguinte.
  const re = /<h3\b[^>]*>((?:(?!<h3)[\s\S])*?)<\/h3>((?:(?!<h3)[\s\S]){0,400}?)Quantidade:\s*(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const peca = limparHtml(m[1])
    if (!peca) continue
    const categoria = m[2].match(/Categoria:\s*([^<]+?)\s*</i)?.[1]?.trim() || null
    itens.push({ peca, quantidade: Number(m[3]), categoria })
  }
  return { tipoEntrega, itens }
}

export async function buscarDetalheCompraFabrica(
  session: FabricaSession,
  numeroPedido: string,
): Promise<DetalheCompraFabrica> {
  const resp = await fetch(`${BASE}/clientes/pedido/${numeroPedido}`, {
    headers: { 'Cookie': session.cookie, 'User-Agent': UA },
    redirect: 'follow',
  })
  const html = await resp.text()
  return parsearDetalheCompra(html)
}

// ─── Status dos pedidos de compra ─────────────────────────────────────────────
// O código só conhecia dois status por terem sido os únicos necessários até aqui
// ("Aguardando pagamento" pro alerta do WhatsApp, "Separado" pra retirada). Pra
// listar "o que ainda não chegou" precisamos do vocabulário inteiro, e ele não
// está documentado em lugar nenhum — então lemos do próprio filtro do portal.

/** Fallback se a descoberta falhar: os únicos status que sabemos existir. */
export const STATUS_COMPRA_CONHECIDOS = [STATUS_AGUARDANDO_PAGAMENTO, STATUS_SEPARADO]

/** O pedido já chegou (ou morreu) — não interessa pra conferência do que está por vir. */
export function ehStatusFinalizado(status: string | null): boolean {
  const s = (status ?? '').toLowerCase()
  return /entregue|cancelad|finalizad|conclu|devolvid|estornad|recusad|reprovad/.test(s)
}

export type StatusCompraOpcao = {
  /** O que vai na querystring `?status=` — pode ser o próprio texto ou um id. */
  valor: string
  /** O texto que o humano lê; é ele que diz se o pedido já chegou. */
  rotulo: string
}

/**
 * Lê as opções do filtro de status em /clientes/pedidos.
 *
 * Puro de propósito — o HTML é de terceiro e é o teste que segura a mudança.
 * Aceita qualquer <select> cujo name/id mencione status. A opção de `value`
 * vazio é o "Todos" do filtro e não serve como status; e valor e rótulo voltam
 * separados porque o portal poderia usar id no value — aí só o rótulo diria se
 * aquele status é de pedido entregue.
 */
export function parsearStatusCompra(html: string): StatusCompraOpcao[] {
  const select = html.match(/<select\b[^>]*(?:name|id)="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/select>/i)?.[1]
  if (!select) return []

  const opcoes: StatusCompraOpcao[] = []
  for (const m of select.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
    const valor = limparHtml(m[1])
    const rotulo = limparHtml(m[2])
    if (!valor) continue
    if (!opcoes.some(o => o.valor === valor)) opcoes.push({ valor, rotulo: rotulo || valor })
  }
  return opcoes
}

/**
 * Status de compra que ainda representam pedido em aberto, descobertos no portal.
 * Cai nos dois conhecidos se o filtro sumir ou o HTML mudar — melhor listar de
 * menos do que estourar a tela inteira.
 */
export async function listarStatusCompraAbertos(session: FabricaSession): Promise<string[]> {
  const url = new URL(`${BASE}/clientes/pedidos`)
  url.searchParams.set('aba', 'compras')

  try {
    const resp = await fetch(url.toString(), {
      headers: { 'Cookie': session.cookie, 'User-Agent': UA },
      redirect: 'follow',
    })
    if (!resp.ok) return STATUS_COMPRA_CONHECIDOS
    const abertos = parsearStatusCompra(await resp.text())
      .filter(o => !ehStatusFinalizado(o.rotulo))
      .map(o => o.valor)
    return abertos.length > 0 ? abertos : STATUS_COMPRA_CONHECIDOS
  } catch {
    return STATUS_COMPRA_CONHECIDOS
  }
}
