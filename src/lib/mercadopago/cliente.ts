// Cliente mínimo da API do Mercado Pago para a mensalidade do MOVA (#208).
// Credencial do MOVA (conta da Infinity Fit), não de grupo: env MP_ACCESS_TOKEN.
// Nunca logar o corpo da requisição nem o header de autorização (spec, seção 8).

const API = 'https://api.mercadopago.com'

export class ErroMercadoPago extends Error {
  constructor(mensagem: string, readonly status?: number) { super(mensagem) }
}

function token(): string {
  const t = process.env.MP_ACCESS_TOKEN
  if (!t) throw new ErroMercadoPago('MP_ACCESS_TOKEN não configurada')
  return t
}

async function chamar<T>(caminho: string, init: RequestInit & { idempotencia?: string }): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token()}`,
    'Content-Type': 'application/json',
  }
  if (init.idempotencia) headers['X-Idempotency-Key'] = init.idempotencia
  const r = await fetch(`${API}${caminho}`, { ...init, headers, signal: AbortSignal.timeout(15_000) })
  // Só o status vai para o erro: o corpo pode ecoar dados da requisição.
  if (!r.ok) throw new ErroMercadoPago(`Mercado Pago respondeu ${r.status} em ${caminho.split('?')[0]}`, r.status)
  return r.json() as Promise<T>
}

import type { Pagamento } from './webhook'

export type Preferencia = { id: string; init_point: string }

/**
 * Link de pagamento (Checkout Pro) para uma mensalidade. A chave de idempotência
 * deriva do que se paga: a mesma cobrança com o mesmo valor devolve o mesmo link.
 */
export function criarPreferencia(p: {
  mensalidadeId: string
  titulo: string
  valor: number
  emailPagador: string | null
  urlNotificacao: string
}): Promise<Preferencia> {
  return chamar<Preferencia>('/checkout/preferences', {
    method: 'POST',
    idempotencia: `mensalidade-${p.mensalidadeId}-${p.valor.toFixed(2)}`,
    body: JSON.stringify({
      items: [{ title: p.titulo, quantity: 1, unit_price: p.valor, currency_id: 'BRL' }],
      external_reference: p.mensalidadeId,
      notification_url: p.urlNotificacao,
      ...(p.emailPagador ? { payer: { email: p.emailPagador } } : {}),
    }),
  })
}

export function consultarPagamento(id: string): Promise<Pagamento> {
  return chamar<Pagamento>(`/v1/payments/${encodeURIComponent(id)}`, { method: 'GET' })
}
