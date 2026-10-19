import { createHmac, timingSafeEqual } from 'node:crypto'

// Webhook do Mercado Pago (#208). A notificação não traz valor nem status: só diz
// que algo mudou. A baixa vem de uma consulta à API (spec, seção 5).

/**
 * Valida o header x-signature ("ts=...,v1=..."). O manifesto é
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", com o data.id em minúsculas;
 * parte ausente na notificação sai do manifesto (doc do Mercado Pago).
 */
export function assinaturaValida(p: { secret: string; xSignature: string | null; xRequestId: string | null; dataId: string | null }): boolean {
  if (!p.secret || !p.xSignature) return false
  const campos = Object.fromEntries(p.xSignature.split(',').map(s => s.trim().split('=', 2) as [string, string]))
  const ts = campos.ts
  const v1 = campos.v1
  if (!ts || !v1) return false

  let manifesto = ''
  if (p.dataId) manifesto += `id:${p.dataId.toLowerCase()};`
  if (p.xRequestId) manifesto += `request-id:${p.xRequestId};`
  manifesto += `ts:${ts};`

  const esperado = Buffer.from(createHmac('sha256', p.secret).update(manifesto).digest('hex'))
  const recebido = Buffer.from(v1)
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

export type Pagamento = { id: number | string; status: string; external_reference: string | null; transaction_amount: number; live_mode?: boolean }

export type Baixa =
  | { acao: 'pagar' }
  | { acao: 'ignorar'; motivo: string }
  | { acao: 'erro'; motivo: string }

/** Decide se o pagamento consultado quita a mensalidade. */
export function decidirBaixa(pg: Pagamento, m: { status: string; valorDevido: number } | null): Baixa {
  // Estorno e chargeback não revertem a baixa sozinhos, mas ficam no log para alguém olhar.
  if (pg.status === 'refunded' || pg.status === 'charged_back') return { acao: 'erro', motivo: `pagamento ${pg.status}` }
  if (pg.status !== 'approved') return { acao: 'ignorar', motivo: `pagamento ${pg.status}` }
  if (!m) return { acao: 'erro', motivo: 'mensalidade da external_reference não encontrada' }
  if (m.status === 'paga') return { acao: 'ignorar', motivo: 'mensalidade já paga' }
  if (m.status !== 'aberta') return { acao: 'erro', motivo: `pagamento aprovado para mensalidade ${m.status}` }
  // Centavo de tolerância para arredondamento do lado deles.
  if (pg.transaction_amount + 0.01 < m.valorDevido) {
    return { acao: 'erro', motivo: `valor pago ${pg.transaction_amount} menor que o devido ${m.valorDevido}` }
  }
  return { acao: 'pagar' }
}

/** Produção só aceita notificação real; fora dela, só de teste. */
export function ambienteConfere(liveMode: boolean | undefined, producao: boolean): boolean {
  return liveMode === undefined ? true : liveMode === producao
}

/** 4xx da API não melhora com reenvio, exceto timeout (408) e limite de requisições (429). */
export function falhaDefinitiva(status: number | undefined): boolean {
  return !!status && status >= 400 && status < 500 && status !== 408 && status !== 429
}
