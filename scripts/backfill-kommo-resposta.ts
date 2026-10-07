/**
 * Backfill do estado de resposta por lead (primeiro_incoming_em /
 * primeira_resposta_em).
 *
 * Por que existe: o UPDATE do sincronizarAtividadeKommo estourava em toda
 * execução (array JS solto no sql`` do drizzle vira row constructor e
 * `(...)::bigint[]` é SQL inválido), então esses dois campos nunca foram
 * gravados pelo caminho incremental — só pelo backfill único de 29/07. Depois
 * de corrigido, este script recupera a janela perdida.
 *
 * O sync normal só olha 2 dias para trás, e como ele lê os eventos de chat
 * (volume alto), aqui a varredura é feita em janelas e o estado só é calculado
 * no fim, sobre TODOS os eventos juntos — assim um lead cujo 1º contato caiu
 * numa janela e a resposta em outra não vira falso "sem resposta".
 *
 * Uso:
 *   npx dotenv-cli -e .env.production.local -- node --import tsx scripts/backfill-kommo-resposta.ts --dias 14
 */
import postgres from 'postgres'
import { estadoRespostaDoLead } from '../src/lib/kommo-resposta'

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : undefined
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.production.local -- ...`')
  process.exit(1)
}

const DIAS = Number(arg('--dias') ?? 14)
const JANELA_DIAS = 2 // fatia da varredura; o teto da API é 250 x 200 páginas
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

type Evento = { type: string; entity_id: number; created_by: number; created_at: number }

async function main() {
  const [cfg] = await sql`select access_token, subdominio from kommo_config where id = 'global'`
  if (!cfg?.access_token || !cfg?.subdominio) throw new Error('Kommo não conectado (Admin → Kommo)')
  const BASE = `https://${cfg.subdominio}.kommo.com`
  const H = { Authorization: `Bearer ${cfg.access_token}`, Accept: 'application/json' }

  const api = async (p: string) => {
    const r = await fetch(BASE + p, { headers: H })
    if (r.status === 204) return null
    if (!r.ok) throw new Error(`${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return r.json()
  }

  const tq = ['incoming_chat_message', 'outgoing_chat_message'].map(t => `filter[type][]=${t}`).join('&')
  const agora = Math.floor(Date.now() / 1000)
  const inicio = agora - DIAS * 86400
  const eventos: Evento[] = []

  for (let de = inicio; de < agora; de += JANELA_DIAS * 86400) {
    const ate = Math.min(de + JANELA_DIAS * 86400, agora)
    let naJanela = 0
    for (let page = 1; page <= 200; page++) {
      const d = await api(`/api/v4/events?limit=250&page=${page}&${tq}&filter[created_at][from]=${de}&filter[created_at][to]=${ate}`)
      const evs: Evento[] = d?._embedded?.events ?? []
      eventos.push(...evs)
      naJanela += evs.length
      if (!d?._links?.next) break
    }
    console.log(`${new Date(de * 1000).toISOString().slice(0, 10)} → ${new Date(ate * 1000).toISOString().slice(0, 10)}: ${naJanela} eventos`)
  }
  console.log(`total de eventos: ${eventos.length}`)

  // Estado por lead sobre o conjunto inteiro — mesma regra do sync.
  const porLead = new Map<number, Evento[]>()
  for (const m of eventos) {
    const a = porLead.get(m.entity_id) ?? []
    a.push(m); porLead.set(m.entity_id, a)
  }
  const upd: { id: number; fin: string; fr: string | null }[] = []
  for (const [leadId, lista] of porLead) {
    // Mesma regra do sync — importada, não recopiada, senão backfill e
    // incremental divergem e ninguém percebe.
    const { leadIn, leadResp } = estadoRespostaDoLead(lista)
    if (leadIn != null) {
      upd.push({
        id: leadId,
        fin: new Date(leadIn * 1000).toISOString(),
        fr: leadResp != null ? new Date(leadResp * 1000).toISOString() : null,
      })
    }
  }
  console.log(`leads com 1º contato do cliente: ${upd.length}`)

  // Mesmo LEAST do sync: guarda o instante mais antigo conhecido, então rodar
  // de novo é inofensivo e ainda corrige 1ª resposta que ficou tarde demais.
  let gravados = 0
  for (let i = 0; i < upd.length; i += 2000) {
    const c = upd.slice(i, i + 2000)
    const r = await sql`
      UPDATE kommo_leads k SET
        primeiro_incoming_em = LEAST(k.primeiro_incoming_em, t.fin::timestamptz),
        primeira_resposta_em = LEAST(k.primeira_resposta_em, t.fr::timestamptz)
      FROM unnest(${c.map(r => r.id)}::bigint[], ${c.map(r => r.fin)}::text[], ${c.map(r => r.fr)}::text[]) AS t(id, fin, fr)
      WHERE k.lead_id = t.id`
    gravados += r.count
  }
  console.log(`linhas atualizadas: ${gravados}`)

  const [v] = await sql`
    SELECT max(primeiro_incoming_em) AS max_incoming,
           count(*) FILTER (WHERE primeiro_incoming_em >= now() - interval '14 days') AS com_incoming_14d,
           count(*) FILTER (WHERE primeiro_incoming_em >= now() - interval '14 days' AND primeira_resposta_em IS NULL) AS sem_resposta_14d
    FROM kommo_leads`
  console.log(`\nmax(primeiro_incoming_em) = ${v.max_incoming}`)
  console.log(`últimos 14 dias: ${v.com_incoming_14d} com 1º contato, ${v.sem_resposta_14d} sem resposta`)
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error('FALHA:', e); await sql.end(); process.exit(1) })
