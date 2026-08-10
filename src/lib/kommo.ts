import { db } from '@/lib/db'
import { kommoConfig, kommoLeads, kommoSyncStatus, kommoUserMap, kommoAtividadeDiaria, kommoLossReasons, kommoStages, kommoTarefasAbertas, kommoSources } from '@/lib/db/schema'
import { eq, sql, gte } from 'drizzle-orm'
import { etapaDeFechamento } from '@/lib/kommo-etapas'
import { sqlEstadoRespostaLead } from '@/lib/kommo-sql'

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

export type ResultadoVirarLead =
  | { resultado: 'virado'; leadId: number }
  | { resultado: 'ja_ganho'; leadId: number }
  | { resultado: 'ambiguo'; qtd: number; subdominio: string }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'desligado' }
  | { resultado: 'erro' }

// Ao vender no Mova: acha o lead do cliente no Kommo (pelos últimos 8 dígitos do
// celular — o Kommo guarda sem o "9" do celular) e marca como Venda Ganha (142),
// já preenchendo o valor. Best-effort — nunca lança.
export async function virarLeadKommo(celular: string | null | undefined, valorVenda?: number): Promise<ResultadoVirarLead> {
  try {
    const cfg = await getKommoConfig()
    if (!cfg?.accessToken || !cfg.subdominio) return { resultado: 'desligado' }
    const dig = (celular ?? '').replace(/\D/g, '')
    if (dig.length < 8) return { resultado: 'nao_encontrado' }
    const ult8 = dig.slice(-8)

    const cData = await kommoRequest(`/api/v4/contacts?query=${ult8}&with=leads&limit=10`) as
      { _embedded?: { contacts?: { _embedded?: { leads?: { id: number }[] } }[] } } | null
    const leadIds = new Set<number>()
    for (const c of cData?._embedded?.contacts ?? []) for (const l of c._embedded?.leads ?? []) leadIds.add(l.id)
    if (leadIds.size === 0) return { resultado: 'nao_encontrado' }

    const leads: { id: number; status: number | undefined }[] = []
    for (const id of leadIds) {
      const l = await kommoRequest(`/api/v4/leads/${id}`) as { id: number; status_id?: number } | null
      if (l) leads.push({ id: l.id, status: l.status_id })
    }
    const abertos = leads.filter(l => l.status !== KOMMO_STATUS_GANHO && l.status !== KOMMO_STATUS_PERDIDO)
    const ganhos = leads.filter(l => l.status === KOMMO_STATUS_GANHO)

    // Se já existe um lead ganho desse cliente, a venda já está contabilizada —
    // não vira o aberto (evita duplicar a venda ganha).
    if (ganhos.length > 0) return { resultado: 'ja_ganho', leadId: ganhos[0].id }
    if (abertos.length === 1) {
      const id = abertos[0].id
      const body: Record<string, unknown> = { status_id: KOMMO_STATUS_GANHO }
      if (valorVenda && valorVenda > 0) body.price = Math.round(valorVenda)
      await kommoRequest(`/api/v4/leads/${id}`, { method: 'PATCH', body })
      return { resultado: 'virado', leadId: id }
    }
    if (abertos.length > 1) return { resultado: 'ambiguo', qtd: abertos.length, subdominio: cfg.subdominio }
    return { resultado: 'nao_encontrado' }
  } catch {
    return { resultado: 'erro' }
  }
}
const JANELA_CACHE_MS = 15 * 60 * 1000
// Piso de backfill na 1ª sincronização (updated_at) — cobre o ano corrente.
const BACKFILL_FLOOR = Math.floor(new Date(Date.UTC(2026, 0, 1)).getTime() / 1000)

export type LeadKommo = {
  id: number
  name?: string | null
  price?: number | null
  status_id?: number
  pipeline_id?: number
  responsible_user_id?: number
  loss_reason_id?: number | null
  source_id?: number | null
  created_at?: number
  closed_at?: number | null
  updated_at?: number
}

// Catálogo de motivos de perda (id -> nome). Barato; roda junto do sync.
async function sincronizarMotivosPerda(): Promise<void> {
  const data = await kommoRequest('/api/v4/leads/loss_reasons') as
    { _embedded?: { loss_reasons?: { id: number; name: string }[] } } | null
  const motivos = data?._embedded?.loss_reasons ?? []
  if (motivos.length === 0) return
  await db.insert(kommoLossReasons)
    .values(motivos.map(m => ({ id: m.id, nome: m.name })))
    .onConflictDoUpdate({ target: kommoLossReasons.id, set: { nome: sql`excluded.nome` } })
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
    // `with=source_id` é obrigatório: sem ele a API omite o campo e o canal de
    // entrada some — é o eixo do relatório de marketing.
    const data = await kommoRequest(
      `/api/v4/leads?limit=250&page=${page}&order[updated_at]=asc&filter[updated_at][from]=${desde}&with=source_id`,
    ) as { _embedded?: { leads?: LeadKommo[] }; _links?: { next?: unknown } } | null
    const leads = data?._embedded?.leads ?? []
    if (leads.length === 0) break

    const valores = leads.map(l => {
      if (l.updated_at && l.updated_at > maiorUpdated) maiorUpdated = l.updated_at
      return {
        leadId: l.id,
        nome: l.name ?? null,
        kommoUserId: l.responsible_user_id != null ? String(l.responsible_user_id) : null,
        statusId: l.status_id ?? null,
        pipelineId: l.pipeline_id != null ? String(l.pipeline_id) : null,
        price: String(l.price ?? 0),
        lossReasonId: l.loss_reason_id ?? null,
        sourceId: l.source_id ?? null,
        criadoEm: toDate(l.created_at),
        fechadoEm: toDate(l.closed_at),
        atualizadoEm: toDate(l.updated_at),
      }
    })
    // Upsert em lote (1 statement por página de 250). Não sobrescreve o estado de
    // resposta (primeiro_incoming_em/primeira_resposta_em) — isso vem do sync de atividade.
    await db.insert(kommoLeads).values(valores).onConflictDoUpdate({
      target: kommoLeads.leadId,
      set: {
        nome:         sql`excluded.nome`,
        kommoUserId:  sql`excluded.kommo_user_id`,
        statusId:     sql`excluded.status_id`,
        pipelineId:   sql`excluded.pipeline_id`,
        price:        sql`excluded.price`,
        lossReasonId: sql`excluded.loss_reason_id`,
        // COALESCE: se a API vier sem source_id num update, mantém o que o
        // backfill já descobriu em vez de apagar o canal.
        sourceId:     sql`coalesce(excluded.source_id, ${kommoLeads.sourceId})`,
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
  // Estado por lead: 1ª msg do cliente e 1ª resposta humana (Fase 3 — sem resposta / SLA)
  const respostaLead: { id: number; fin: string; fr: string | null }[] = []
  for (const [leadId, lista] of porLead) {
    lista.sort((a, b) => a.created_at - b.created_at)
    let firstIn: number | null = null          // ciclo p/ mediana (reseta)
    let leadIn: number | null = null           // 1º incoming do lead (uma vez)
    let leadResp: number | null = null         // 1ª resposta humana do lead (uma vez)
    for (const m of lista) {
      if (m.type === 'incoming_chat_message') {
        if (firstIn == null) firstIn = m.created_at
        if (leadIn == null) leadIn = m.created_at
      } else if (m.type === 'outgoing_chat_message' && m.created_by) {
        if (leadIn != null && leadResp == null) leadResp = m.created_at
        if (firstIn != null && mapeados.has(String(m.created_by))) {
          const dt = m.created_at - firstIn
          const h = horaBRT(firstIn)
          if (dt >= 0 && dt < 3 * 86400 && h >= 8 && h < 18) {
            const k = `${diaBRT(m.created_at)}|${m.created_by}`
            const arr = respTimes.get(k) ?? []
            arr.push(dt); respTimes.set(k, arr)
          }
          firstIn = null
        }
      }
    }
    if (leadIn != null) respostaLead.push({ id: leadId, fin: new Date(leadIn * 1000).toISOString(), fr: leadResp != null ? new Date(leadResp * 1000).toISOString() : null })
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

  // Estado de resposta por lead: guarda o 1º incoming (menor) e a 1ª resposta
  // (só se ainda não houver) — incremental-safe entre execuções.
  if (respostaLead.length > 0) {
    const ids = respostaLead.map(r => r.id)
    const fins = respostaLead.map(r => r.fin)
    const frs = respostaLead.map(r => r.fr)
    await db.execute(sqlEstadoRespostaLead(ids, fins, frs))
  }

  return { eventos: msgs.length + tarefas.length }
}

type PipelineKommo = {
  id: number
  name?: string
  _embedded?: { statuses?: { id: number; name?: string; sort?: number }[] }
}

// Catálogo de funis/etapas. Os status 142 (ganho) e 143 (perdido) são globais e
// se repetem em todo funil — ficam de fora para não colidir na PK.
export async function sincronizarEtapasKommo(): Promise<{ etapas: number }> {
  const data = await kommoRequest('/api/v4/leads/pipelines') as
    { _embedded?: { pipelines?: PipelineKommo[] } } | null
  const rows = (data?._embedded?.pipelines ?? []).flatMap(p =>
    (p._embedded?.statuses ?? [])
      .filter(s => s.id !== KOMMO_STATUS_GANHO && s.id !== KOMMO_STATUS_PERDIDO)
      .map(s => ({
        statusId: s.id,
        pipelineId: String(p.id),
        pipelineNome: p.name ?? null,
        nome: s.name ?? '',
        sort: s.sort ?? 0,
        etapaFechamento: etapaDeFechamento(s.name),
      })),
  )
  if (rows.length === 0) return { etapas: 0 }
  await db.insert(kommoStages).values(rows).onConflictDoUpdate({
    target: kommoStages.statusId,
    set: {
      pipelineId:      sql`excluded.pipeline_id`,
      pipelineNome:    sql`excluded.pipeline_nome`,
      nome:            sql`excluded.nome`,
      sort:            sql`excluded.sort`,
      etapaFechamento: sql`excluded.etapa_fechamento`,
    },
  })
  return { etapas: rows.length }
}

type TalkKommo = { source_id?: number | null; origin?: string | null }
type UnsortedKommo = {
  metadata?: { service?: string | null; source_name?: string | null }
  _embedded?: { leads?: { id: number }[] }
}

// Catálogo de canal de entrada (kommo_sources). A API não dá o nome do canal
// direto — /api/v4/sources responde 204 porque só lista sources da própria
// integração. Então monta-se por duas vias:
//   /talks    → source_id + origin (o tipo do canal: WhatsApp, Instagram, ...)
//   /unsorted → service + source_name (o PERFIL: motochefepocos, o número do
//               WhatsApp, a página do Facebook), casado com o lead da fila.
// O que nenhuma das duas nomear fica só com o id e o Cesar batiza em
// /admin/canais — `nome` nunca é sobrescrito aqui.
//
// Os limites abaixo são de LATÊNCIA, não de correção: isto roda dentro do
// caminho de uma requisição de página (a cada 15min, quando o cache vence), e
// varrer a fila inteira de não distribuídos custaria ~45 chamadas sequenciais.
// O catálogo é cumulativo — cada rodada acrescenta o que achar, e canal ativo
// aparece em poucas rodadas. Página lenta é problema recorrente aqui.
const PAGINAS_TALKS = 2
const PAGINAS_UNSORTED = 2
const LOTES_LEAD = 6

export async function sincronizarCanaisKommo(): Promise<{ canais: number }> {
  const achados = new Map<number, { origem: string | null; perfil: string | null }>()
  const guardar = (id: number | null | undefined, origem?: string | null, perfil?: string | null) => {
    if (id == null) return
    const atual = achados.get(id) ?? { origem: null, perfil: null }
    achados.set(id, { origem: origem ?? atual.origem, perfil: perfil ?? atual.perfil })
  }

  // 1) Conversas — dão o tipo de canal da maior parte do volume.
  for (let page = 1; page <= PAGINAS_TALKS; page++) {
    const d = await kommoRequest(`/api/v4/talks?limit=250&page=${page}`) as
      { _embedded?: { talks?: TalkKommo[] }; _links?: { next?: unknown } } | null
    const talks = d?._embedded?.talks ?? []
    if (talks.length === 0) break
    for (const t of talks) guardar(t.source_id, t.origin ?? null)
    if (!d?._links?.next) break
  }

  // 2) Fila de leads não distribuídos — traz o nome do perfil. Precisa casar
  //    com o lead para chegar no source_id, que a fila não expõe.
  const porLead = new Map<number, { service: string | null; perfil: string | null }>()
  for (let page = 1; page <= PAGINAS_UNSORTED; page++) {
    const d = await kommoRequest(`/api/v4/leads/unsorted?limit=250&page=${page}`) as
      { _embedded?: { unsorted?: UnsortedKommo[] }; _links?: { next?: unknown } } | null
    const fila = d?._embedded?.unsorted ?? []
    if (fila.length === 0) break
    for (const u of fila) {
      const leadId = u._embedded?.leads?.[0]?.id
      if (leadId) porLead.set(leadId, { service: u.metadata?.service ?? null, perfil: u.metadata?.source_name ?? null })
    }
    if (!d?._links?.next) break
  }
  const ids = [...porLead.keys()].slice(0, LOTES_LEAD * 50)
  for (let i = 0; i < ids.length; i += 50) {
    const filtro = ids.slice(i, i + 50).map(id => `filter[id][]=${id}`).join('&')
    const d = await kommoRequest(`/api/v4/leads?limit=250&${filtro}&with=source_id`) as
      { _embedded?: { leads?: LeadKommo[] } } | null
    for (const l of d?._embedded?.leads ?? []) {
      const info = porLead.get(l.id)
      if (info) guardar(l.source_id, info.service, info.perfil)
    }
  }

  if (achados.size === 0) return { canais: 0 }
  await db.insert(kommoSources)
    .values([...achados].map(([sourceId, v]) => ({ sourceId, origem: v.origem, perfil: v.perfil })))
    .onConflictDoUpdate({
      target: kommoSources.sourceId,
      set: {
        // coalesce: uma rodada em que só /talks respondeu não pode apagar o
        // perfil que a fila já tinha revelado.
        origem:       sql`coalesce(excluded.origem, ${kommoSources.origem})`,
        perfil:       sql`coalesce(excluded.perfil, ${kommoSources.perfil})`,
        atualizadoEm: new Date(),
      },
    })
  return { canais: achados.size }
}

type TarefaKommo = {
  id: number
  entity_id?: number
  entity_type?: string
  responsible_user_id?: number
  complete_till?: number | null
  text?: string | null
}

// Tarefas em aberto de leads. Replace-all: o conjunto é pequeno e assim tarefa
// concluída, reagendada ou deletada some sem precisar de evento.
export async function sincronizarTarefasAbertas(): Promise<{ tarefas: number }> {
  const out: TarefaKommo[] = []
  for (let page = 1; page <= 200; page++) {
    const data = await kommoRequest(
      `/api/v4/tasks?limit=250&page=${page}&filter[is_completed]=0`,
    ) as { _embedded?: { tasks?: TarefaKommo[] }; _links?: { next?: unknown } } | null
    const tasks = data?._embedded?.tasks ?? []
    out.push(...tasks)
    if (!data?._links?.next) break
  }
  const rows = out
    .filter(t => t.entity_type === 'leads' && t.entity_id)
    .map(t => ({
      id: t.id,
      leadId: t.entity_id as number,
      kommoUserId: t.responsible_user_id != null ? String(t.responsible_user_id) : null,
      prazo: toDate(t.complete_till),
      texto: t.text ?? null,
    }))

  await db.delete(kommoTarefasAbertas)
  // Lotes de 500 para não estourar o limite de parâmetros do postgres.js
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(kommoTarefasAbertas).values(rows.slice(i, i + 500))
  }
  return { tarefas: rows.length }
}

// Sincroniza se o cache passou da janela (15min) ou se forçado. Nunca lança —
// devolve a hora da última sincronização pra UI.
export async function sincronizarSeNecessario(forcar = false): Promise<{ ultima: Date | null; erro: string | null }> {
  const [st] = await db.select().from(kommoSyncStatus).where(eq(kommoSyncStatus.id, 'global')).limit(1)
  const stale = !st?.ultimaSincronizacao || (Date.now() - new Date(st.ultimaSincronizacao).getTime()) > JANELA_CACHE_MS
  if (!forcar && !stale) return { ultima: st?.ultimaSincronizacao ?? null, erro: null }
  try {
    // Cada etapa é isolada e o erro dela aparece na UI. Antes, um estouro na
    // atividade derrubava calado tudo o que vinha depois (tarefas, etapas,
    // canais) — foi assim que o UPDATE quebrado do estado de resposta passou
    // 12 dias sem gravar nada e sem ninguém ver.
    const erros: string[] = []
    const passo = async (nome: string, fn: () => Promise<unknown>) => {
      try { await fn() } catch (e) {
        const msg = e instanceof Error ? e.message : 'falhou'
        console.error(`[kommo] etapa "${nome}" falhou:`, e)
        erros.push(`${nome}: ${msg}`)
      }
    }
    // Leads é pré-requisito de todo o resto — se cair, cai o sync inteiro.
    await sincronizarLeadsKommo()
    await passo('atividade', () => sincronizarAtividadeKommo())
    await passo('motivos de perda', () => sincronizarMotivosPerda())
    await passo('etapas', () => sincronizarEtapasKommo())
    await passo('tarefas', () => sincronizarTarefasAbertas())
    await passo('canais', () => sincronizarCanaisKommo())
    const [novo] = await db.select().from(kommoSyncStatus).where(eq(kommoSyncStatus.id, 'global')).limit(1)
    return {
      ultima: novo?.ultimaSincronizacao ?? null,
      erro: erros.length > 0 ? `Sincronização parcial — ${erros.join(' | ')}` : null,
    }
  } catch (e) {
    return { ultima: st?.ultimaSincronizacao ?? null, erro: e instanceof Error ? e.message : 'Erro ao sincronizar com o Kommo' }
  }
}
