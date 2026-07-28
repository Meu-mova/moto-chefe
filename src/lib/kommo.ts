import { db } from '@/lib/db'
import { kommoConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Integração Kommo (CRM) — conexão OAuth2 GLOBAL (uma conta pra toda a empresa).
// Espelha o padrão do Bling (src/lib/bling.ts), mas com config singleton
// (tabela kommo_config, sempre id = 'global') em vez de por grupo.

const AUTH_URL = 'https://www.kommo.com/oauth'
const CONFIG_ID = 'global'

export function kommoRedirectUri(): string {
  return process.env.KOMMO_REDIRECT_URI ?? 'https://mova.motochefesuldeminas.com.br/api/kommo/callback'
}

function tokenUrl(subdominio: string): string {
  return `https://${subdominio}.kommo.com/oauth2/access_token`
}

export async function getKommoConfig() {
  const [cfg] = await db.select().from(kommoConfig).where(eq(kommoConfig.id, CONFIG_ID)).limit(1)
  return cfg ?? null
}

export async function salvarCredenciaisKommo(clientId: string, clientSecret: string, subdominio: string | null) {
  await db.insert(kommoConfig)
    .values({ id: CONFIG_ID, clientId, clientSecret, subdominio: subdominio || null, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: kommoConfig.id,
      set: { clientId, clientSecret, ...(subdominio ? { subdominio } : {}), atualizadoEm: new Date() },
    })
}

export function kommoAuthUrl(clientId: string, state: string): string {
  // O Kommo não recebe redirect_uri no authorize — usa o Redirect URL registrado
  // na integração privada. O subdomínio da conta volta no callback (param `referer`).
  const params = new URLSearchParams({ client_id: clientId, state, mode: 'post_message' })
  return `${AUTH_URL}?${params}`
}

type TokensKommo = { access_token: string; refresh_token: string; expires_in: number }

export async function trocarCodePorTokens(subdominio: string, clientId: string, clientSecret: string, code: string): Promise<TokensKommo> {
  const res = await fetch(tokenUrl(subdominio), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: kommoRedirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`Kommo token error: ${await res.text()}`)
  return res.json() as Promise<TokensKommo>
}

async function refreshAccessToken(subdominio: string, clientId: string, clientSecret: string, refreshToken: string): Promise<TokensKommo> {
  const res = await fetch(tokenUrl(subdominio), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: kommoRedirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`Kommo refresh error: ${await res.text()}`)
  return res.json() as Promise<TokensKommo>
}

export async function salvarTokensKommo(access: string, refresh: string, expiresIn: number, subdominio?: string) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  await db.insert(kommoConfig)
    .values({ id: CONFIG_ID, accessToken: access, refreshToken: refresh, expiresAt, subdominio: subdominio || null, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: kommoConfig.id,
      set: { accessToken: access, refreshToken: refresh, expiresAt, ...(subdominio ? { subdominio } : {}), atualizadoEm: new Date() },
    })
}

// Salva um token de longa duração (integração privada do Kommo) — sem refresh.
export async function salvarTokenLongo(token: string, subdominio: string, expiraEm: Date | null) {
  await db.insert(kommoConfig)
    .values({ id: CONFIG_ID, accessToken: token, refreshToken: null, expiresAt: expiraEm, subdominio, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: kommoConfig.id,
      set: { accessToken: token, refreshToken: null, expiresAt: expiraEm, subdominio, atualizadoEm: new Date() },
    })
}

export async function getKommoStatus() {
  const cfg = await getKommoConfig()
  return {
    conectado: !!(cfg?.accessToken && cfg?.subdominio),
    metodo: cfg?.refreshToken ? ('oauth' as const) : (cfg?.accessToken ? ('token' as const) : null),
    temCredenciais: !!(cfg?.clientId && cfg?.clientSecret),
    subdominio: cfg?.subdominio ?? null,
    expiraEm: cfg?.expiresAt ?? null,
    atualizadoEm: cfg?.atualizadoEm ?? null,
  }
}

// Access token válido para a API. Dois modos:
//  - Token de longa duração: accessToken presente e SEM refreshToken → usa direto.
//  - OAuth: refaz o refresh quando faltam <5min p/ expirar.
async function getToken(): Promise<{ token: string; subdominio: string }> {
  const cfg = await getKommoConfig()
  if (!cfg?.subdominio) throw new Error('Kommo não conectado (subdomínio ausente). Configure em Admin → Kommo.')

  // Modo token de longa duração
  if (cfg.accessToken && !cfg.refreshToken) {
    if (cfg.expiresAt && cfg.expiresAt <= new Date()) {
      throw new Error('Token do Kommo expirado. Gere um novo em Admin → Kommo.')
    }
    return { token: cfg.accessToken, subdominio: cfg.subdominio }
  }

  // Modo OAuth (com refresh)
  if (!cfg.refreshToken || !cfg.clientId || !cfg.clientSecret) {
    throw new Error('Kommo não conectado. Configure em Admin → Kommo.')
  }
  const agora = new Date()
  if (!cfg.accessToken || !cfg.expiresAt || cfg.expiresAt <= new Date(agora.getTime() + 5 * 60 * 1000)) {
    const tokens = await refreshAccessToken(cfg.subdominio, cfg.clientId, cfg.clientSecret, cfg.refreshToken)
    await salvarTokensKommo(tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return { token: tokens.access_token, subdominio: cfg.subdominio }
  }
  return { token: cfg.accessToken, subdominio: cfg.subdominio }
}

// Request autenticado genérico contra a API v4 do Kommo (subdomínio da conta).
export async function kommoRequest(path: string, init?: { method?: string; body?: unknown }) {
  const { token, subdominio } = await getToken()
  const res = await fetch(`https://${subdominio}.kommo.com${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Kommo API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}
