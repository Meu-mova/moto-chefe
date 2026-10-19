import { createHmac } from 'node:crypto'

// Regras puras do teste de ponta a ponta da mensalidade (scripts/e2e-mensalidade.ts).

const REF_STAGING = 'pulsqeymzsheasxsdnnk'

/** Só roda contra o staging: banco e Supabase do staging e app num preview ou no dev.meumova.com. */
export function motivoRecusa(p: { url: string; supabaseUrl: string | undefined; databaseUrl: string | undefined }): string | null {
  let u: URL
  try {
    u = new URL(p.url)
  } catch {
    return 'E2E_URL inválida'
  }
  const local = u.hostname === 'localhost'
  const preview = /^mova-motochefe-[a-z0-9-]+\.vercel\.app$/.test(u.hostname)
  if (!local && !preview && u.hostname !== 'dev.meumova.com') return `app fora do staging: ${u.host}`
  if (!p.supabaseUrl?.includes(REF_STAGING)) return 'Supabase do env não é o staging'
  if (!p.databaseUrl?.includes(REF_STAGING)) return 'DATABASE_URL do env não é o staging'
  return null
}

/** Assina uma notificação como o Mercado Pago faz (x-signature), para o webhook aceitar. */
export function assinarNotificacao(secret: string, dataId: string, requestId: string, ts: string): string {
  const v1 = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex')
  return `ts=${ts},v1=${v1}`
}
