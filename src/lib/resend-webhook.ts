import { createHmac, timingSafeEqual } from 'node:crypto'

// Os webhooks do Resend são assinados pelo esquema do Svix: cabeçalhos
// svix-id / svix-timestamp / svix-signature, e um segredo "whsec_<base64>".
// A assinatura é HMAC-SHA256 de `${id}.${timestamp}.${body}` com o segredo
// decodificado de base64, e vem como lista "v1,<sig> v1,<sig>" separada por espaço.
export function verificarAssinaturaResend(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignature: string,
): boolean {
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const assinado = `${svixId}.${svixTimestamp}.${rawBody}`
  const esperado = Buffer.from(createHmac('sha256', secretBytes).update(assinado).digest('base64'))

  // Qualquer uma das assinaturas fornecidas batendo já vale (rotação de chave).
  return svixSignature.split(' ').some(parte => {
    const sig = parte.split(',')[1]
    if (!sig) return false
    const buf = Buffer.from(sig)
    return buf.length === esperado.length && timingSafeEqual(buf, esperado)
  })
}

export type EventoResend = {
  tipo: string
  emailId: string | null
  to: string | null
  motivo: string | null
}

/** Extrai o que interessa do payload do webhook. Puro — é o que os testes cobrem. */
export function parseEventoResend(json: unknown): EventoResend | null {
  const obj = json as { type?: unknown; data?: Record<string, unknown> } | null
  const tipo = obj?.type
  if (typeof tipo !== 'string') return null

  const data = obj?.data ?? {}
  const emailId = typeof data.email_id === 'string' ? data.email_id
    : typeof data.id === 'string' ? data.id
    : null
  const to = Array.isArray(data.to) ? String(data.to[0] ?? '') || null
    : typeof data.to === 'string' ? data.to
    : null
  const bounce = data.bounce as { message?: string; subType?: string } | undefined
  const motivo = bounce?.message ?? bounce?.subType
    ?? (typeof data.reason === 'string' ? data.reason : null)

  return { tipo, emailId, to, motivo: motivo ?? null }
}

/** Só bounce e reclamação (spam) interessam — o resto (sent/delivered) ignoramos. */
export function eventoIndicaFalha(tipo: string): boolean {
  return tipo === 'email.bounced' || tipo === 'email.complained'
}
