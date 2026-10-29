import { randomBytes } from 'node:crypto'

/**
 * Places API (New) do Google: nota, total e as até 5 avaliações que a API devolve por
 * loja. Puro (sem banco), para ser testado sem rede. Doc:
 * https://developers.google.com/maps/documentation/places/web-service/place-details
 */

export type AvaliacaoPlaces = {
  googleId: string
  autor: string | null
  autorUri: string | null
  nota: number
  texto: string | null
  publicadaEm: string | null
}

export type LugarPlaces = {
  nota: number | null
  total: number | null
  mapsUri: string | null
  avaliacoes: AvaliacaoPlaces[]
}

// O campo `reviews` cai no SKU Enterprise + Atmosphere; pedir só o que a tela usa.
const CAMPOS = 'rating,userRatingCount,googleMapsUri,reviews'

/** Place ID do Google: letras, números, `_` e `-`. Fora disso não chega à URL da API. */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/

export function placeIdValido(placeId: string): boolean {
  return PLACE_ID.test(placeId)
}

/** Tela do Google que abre direto o "escrever avaliação" da ficha. */
export function linkEscreverAvaliacao(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

// Sem 0/O e 1/I/L: o código pode ter de ser lido em voz alta ou digitado da placa.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Código público da placa (vai no link gravado na tag). 10 caracteres ≈ 49 bits. */
export function gerarCodigoPlaca(): string {
  const bytes = randomBytes(10)
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
}

export function codigoPlacaValido(codigo: string): boolean {
  return /^[a-z2-9]{10}$/.test(codigo)
}

type RespostaPlaces = {
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  reviews?: {
    name?: string
    rating?: number
    text?: { text?: string }
    originalText?: { text?: string }
    publishTime?: string
    authorAttribution?: { displayName?: string; uri?: string }
  }[]
}

export function lerRespostaPlaces(json: unknown): LugarPlaces {
  const r = (json ?? {}) as RespostaPlaces
  const avaliacoes: AvaliacaoPlaces[] = []
  for (const rev of r.reviews ?? []) {
    if (!rev.name || typeof rev.rating !== 'number') continue
    avaliacoes.push({
      googleId: rev.name,
      autor: rev.authorAttribution?.displayName ?? null,
      autorUri: rev.authorAttribution?.uri ?? null,
      nota: Math.round(rev.rating),
      // `text` vem traduzido para o languageCode; o original fica de reserva.
      texto: rev.text?.text ?? rev.originalText?.text ?? null,
      publicadaEm: rev.publishTime ?? null,
    })
  }
  return {
    nota: typeof r.rating === 'number' ? r.rating : null,
    total: typeof r.userRatingCount === 'number' ? r.userRatingCount : null,
    mapsUri: r.googleMapsUri ?? null,
    avaliacoes,
  }
}

/** Erro da API com frase que a tela pode mostrar. Nunca leva a chave. */
export function mensagemErroPlaces(status: number, json: unknown): string {
  const motivo = (json as { error?: { status?: string } } | null)?.error?.status
  if (status === 400 && motivo === 'INVALID_ARGUMENT') return 'Place ID inválido para o Google'
  if (status === 403 || motivo === 'PERMISSION_DENIED') return 'Chave recusada pelo Google (confira se a Places API (New) está ativada e se a chave não tem restrição que a bloqueie)'
  if (status === 404 || motivo === 'NOT_FOUND') return 'Loja não encontrada no Google com esse Place ID'
  if (status === 429) return 'Limite de consultas do Google atingido; tente mais tarde'
  return `Google respondeu HTTP ${status}`
}

export async function buscarLugarNoGoogle(
  apiKey: string,
  placeId: string,
  fetchFn: typeof fetch = fetch,
): Promise<LugarPlaces> {
  if (!placeIdValido(placeId)) throw new Error('Place ID inválido para o Google')
  const res = await fetchFn(`https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': CAMPOS },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(mensagemErroPlaces(res.status, json))
  return lerRespostaPlaces(json)
}
