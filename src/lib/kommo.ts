import { db } from '@/lib/db'
import { kommoConfig, kommoLeads, kommoSyncStatus, kommoUserMap, kommoAtividadeDiaria } from '@/lib/db/schema'
import { eq, sql, gte } from 'drizzle-orm'

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

export const KOMMO_STATUS_GANHO = 142
export const KOMMO_STATUS_PERDIDO = 143
const JANELA_CACHE_MS = 15 * 60 * 1000
// Piso de backfill na 1ª sincronização (updated_at) — cobre o ano corrente.
const BACKFILL_FLOOR = Math.floor(new Date(Date.UTC(2026, 0, 1)).getTime() / 1000)

type LeadKommo = {
  id: number
  price?: number | null
  status_id?: number
  pipeline_id?: number
  responsible_user_id?: number
  created_at?: number
  closed_at?: number | null
  updated_at?: number
}

function toDate(unix?: number | null): Date | null {
  return unix ? new Date(unix * 1000) : null
}

// Sincroniza os leads do Kommo incrementalmente (por updated_at) para o cache local.
export async function sincronizarLeadsKommo(): Promise<{ processados: number }> {
  const [st] = await db.select().from(kommoSyncStatus).where(eq(kommoSyncStatus.id, 'global')).limit(1)
  const desde = st?.ultimoUpdatedAt ?? BACKFILL_FLOOR

  let page = 1
  let processados = 0
  let maiorUpdated = desde
  for (;;) {
    const data = await kommoRequest(
      `/api/v4/leads?limit=250&page=${page}&order[updated_at]=asc&filter[updated_at][from]=${desde}`,
    ) as { _embedded?: { leads?: LeadKommo[] }; _links?: { next?: unknown } } | null
    const leads = data?._embedded?.leads ?? []
    if (leads.length === 0) break

    const valores = leads.map(l => {
      if (l.updated_at && l.updated_at > maiorUpdated) maiorUpdated = l.updated_at
      return {
        leadId: l.id,
        kommoUserId: l.responsible_user_id != null ? String(l.responsible_user_id) : null,
        statusId: l.status_id ?? null,
        pipelineId: l.pipeline_id != null ? String(l.pipeline_id) : null,
        price: String(l.price ?? 0),
        criadoEm: toDate(l.created_at),
        fechadoEm: toDate(l.closed_at),
        atualizadoEm: toDate(l.updated_at),
      }
    })
    // Upsert em lote (1 statement por página de 250)
    await db.insert(kommoLeads).values(valores).onConflictDoUpdate({
      target: kommoLeads.leadId,
      set: {
        kommoUserId:  sql`excluded.kommo_user_id`,
        statusId:     sql`excluded.status_id`,
        pipelineId:   sql`excluded.pipeline_id`,
        price:        sql`excluded.price`,
        criadoEm:     sql`excluded.criado_em`,
        fechadoEm:    sql`excluded.fechado_em`,
        atualizadoEm: sql`excluded.atualizado_em`,
      },
    })
    processados += valores.length

    if (!data?._links?.next) break
    page++
    if (page > 400) break // trava de segurança
  }

  await db.insert(kommoSyncStatus)
    .values({ id: 'global', ultimaSincronizacao: new Date(), ultimoUpdatedAt: maiorUpdated })
    .onConflictDoUpdate({ target: kommoSyncStatus.id, set: { ultimaSincronizacao: new Date(), ultimoUpdatedAt: maiorUpdated } })

  return { processados }
}

type EventoKommo = {
  type: string
  entity_id: number
  created_by: number
  created_at: number
}

async function puxarEventos(types: string[], fromUnix: number): Promise<EventoKommo[]> {
  const tq = types.map(t => `filter[type][]=${t}`).join('&')
  const out: EventoKommo[] = []
  for (let page = 1; page <= 200; page++) {
    const data = await kommoRequest(
      `/api/v4/events?limit=250&page=${page}&${tq}&filter[created_at][from]=${fromUnix}`,
    ) as { _embedded?: { events?: EventoKommo[] }; _links?: { next?: unknown } } | null
    const evs = data?._embedded?.events ?? []
    out.push(...evs)
    if (!data?._links?.next) break
  }
  return out
}

// Dia (BRT, UTC-3) de um timestamp unix — alinha os buckets ao dia útil.
function diaBRT(unix: number): string {
  return new Date((unix - 3 * 3600) * 1000).toISOString().slice(0, 10)
}

// Recalcula a atividade (mensagens/tarefas/tempo de 1ª resposta) dos últimos
// `dias` dias e substitui as linhas desse período. Recompute total do período
// evita dupla contagem entre execuções. Tempo de resposta = 1ª resposta humana
// (created_by=0, cliente/bot, fica de fora). Volume alto → só agregado diário.
export async function sincronizarAtividadeKommo(dias = 2): Promise<{ eventos: number }> {
  const mapeados = new Set((await db.select({ id: kommoUserMap.kommoUserId }).from(kommoUserMap)).map(r => r.id))
  const floorUnix = Math.floor(Date.now() / 1000) - dias * 86400
  const floorDia = diaBRT(floorUnix)

  const msgs = await puxarEventos(['incoming_chat_message', 'outgoing_chat_message'], floorUnix)
  const tarefas = await puxarEventos(['task_completed'], floorUnix)

  // agg[`${dia}|${uid}`] = { mensagens, tarefas }
  const agg = new Map<string, { mensagens: number; tarefas: number }>()
  const bump = (dia: string, uid: string, campo: 'mensagens' | 'tarefas') => {
    if (!mapeados.has(uid)) return
    const k = `${dia}|${uid}`
    const a = agg.get(k) ?? { mensagens: 0, tarefas: 0 }
    a[campo] += 1
    agg.set(k, a)
  }

  for (const m of msgs) if (m.type === 'outgoing_chat_message' && m.created_by) bump(diaBRT(m.created_at), String(m.created_by), 'mensagens')
  for (const t of tarefas) if (t.created_by) bump(diaBRT(t.created_at), String(t.created_by), 'tarefas')

  // Tempo de 1ª resposta: por lead, 1º incoming → 1º outgoing humano seguinte.
  // Só conta quando o lead chega em HORÁRIO COMERCIAL (8h–18h BRT) — evita que
  // leads de madrugada respondidos de manhã inflem o tempo. Guarda os tempos por
  // (dia, colaborador) e grava a MEDIANA do dia.
  const horaBRT = (unix: number) => new Date((unix - 3 * 3600) * 1000).getUTCHours()
  const respTimes = new Map<string, number[]>()
  const porLead = new Map<number, EventoKommo[]>()
  for (const m of msgs) {
    const arr = porLead.get(m.entity_id) ?? []
    arr.push(m); porLead.set(m.entity_id, arr)
  }
  for (const lista of porLead.values()) {
    lista.sort((a, b) => a.created_at - b.created_at)
    let firstIn: number | null = null
    for (const m of lista) {
      if (m.type === 'incoming_chat_message' && firstIn == null) firstIn = m.created_at
      else if (m.type === 'outgoing_chat_message' && firstIn != null && m.created_by) {
        const dt = m.created_at - firstIn
        const h = horaBRT(firstIn)
        if (dt >= 0 && dt < 3 * 86400 && h >= 8 && h < 18 && mapeados.has(String(m.created_by))) {
          const k = `${diaBRT(m.created_at)}|${m.created_by}`
          const arr = respTimes.get(k) ?? []
          arr.push(dt); respTimes.set(k, arr)
        }
        firstIn = null
      }
    }
  }

  const mediana = (arr: number[]) => {
    if (arr.length === 0) return 0
    const s = [...arr].sort((a, b) => a - b)
    const n = s.length
    return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)
  }

  // Substitui as linhas do período recomputado
  await db.delete(kommoAtividadeDiaria).where(gte(kommoAtividadeDiaria.dia, floorDia))
  const chaves = new Set([...agg.keys(), ...respTimes.keys()])
  const rows = [...chaves].map(k => {
    const [dia, kommoUserId] = k.split('|')
    const a = agg.get(k) ?? { mensagens: 0, tarefas: 0 }
    const rt = respTimes.get(k) ?? []
    return { dia, kommoUserId, mensagens: a.mensagens, tarefas: a.tarefas, respMedianaSeg: mediana(rt), respQtd: rt.length }
  })
  if (rows.length > 0) await db.insert(kommoAtividadeDiaria).values(rows)

  return { eventos: msgs.length + tarefas.length }
}

// Sincroniza se o cache passou da janela (15min) ou se forçado. Nunca lança —
// devolve a hora da última sincronização pra UI.
export async function sincronizarSeNecessario(forcar = false): Promise<{ ultima: Date | null; erro: string | null }> {
  const [st] = await db.select().from(kommoSyncStatus).where(eq(kommoSyncStatus.id, 'global')).limit(1)
  const stale = !st?.ultimaSincronizacao || (Date.now() - new Date(st.ultimaSincronizacao).getTime()) > JANELA_CACHE_MS
  if (!forcar && !stale) return { ultima: st?.ultimaSincronizacao ?? null, erro: null }
  try {
    await sincronizarLeadsKommo()
    await sincronizarAtividadeKommo()
    const [novo] = await db.select().from(kommoSyncStatus).where(eq(kommoSyncStatus.id, 'global')).limit(1)
    return { ultima: novo?.ultimaSincronizacao ?? null, erro: null }
  } catch (e) {
    return { ultima: st?.ultimaSincronizacao ?? null, erro: e instanceof Error ? e.message : 'Erro ao sincronizar com o Kommo' }
  }
}
