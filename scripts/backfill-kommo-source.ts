/**
 * Backfill do canal de entrada (kommo_leads.source_id).
 *
 * O sync incremental só toca em lead com `updated_at` novo, então o histórico
 * ficaria sem canal para sempre. Este script varre a conta inteira uma vez.
 * Rodada única — depois disso o sync normal mantém o campo.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/backfill-kommo-source.ts
 *   ... scripts/backfill-kommo-source.ts --desde 2026-01-01   (recorte opcional)
 */
import postgres from 'postgres'

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : undefined
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  process.exit(1)
}

const desde = arg('--desde')
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

async function main() {
  const [cfg] = await sql`select access_token, subdominio from kommo_config where id = 'global'`
  if (!cfg?.access_token || !cfg?.subdominio) throw new Error('Kommo não conectado (Admin → Kommo)')

  const req = async (path: string) => {
    const res = await fetch(`https://${cfg.subdominio}.kommo.com${path}`, {
      headers: { Authorization: `Bearer ${cfg.access_token}`, Accept: 'application/json' },
    })
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`Kommo ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return res.json() as Promise<{ _embedded?: { leads?: { id: number; source_id?: number | null }[] }; _links?: { next?: unknown } }>
  }

  const filtro = desde ? `&filter[created_at][from]=${Math.floor(Date.parse(`${desde}T00:00:00Z`) / 1000)}` : ''
  let page = 1
  let vistos = 0
  let comCanal = 0

  for (;;) {
    const data = await req(`/api/v4/leads?limit=250&page=${page}&order[created_at]=asc&with=source_id${filtro}`)
    const leads = data?._embedded?.leads ?? []
    if (leads.length === 0) break
    vistos += leads.length

    const comSource = leads.filter(l => l.source_id != null)
    if (comSource.length > 0) {
      comCanal += comSource.length
      // UPDATE em lote via unnest — 1 statement por página de 250.
      await sql`
        UPDATE kommo_leads k
        SET source_id = t.sid
        FROM unnest(${comSource.map(l => l.id)}::bigint[], ${comSource.map(l => l.source_id as number)}::bigint[]) AS t(id, sid)
        WHERE k.lead_id = t.id`
    }

    if (page % 20 === 0) console.log(`  página ${page} — ${vistos} lidos, ${comCanal} com canal`)
    if (!data?._links?.next) break
    page++
    if (page > 400) { console.warn('trava de segurança: parou na página 400'); break }
  }

  const [resumo] = await sql`
    select count(*)::int as total, count(source_id)::int as com_canal from kommo_leads`
  console.log(`\nlidos da API: ${vistos} | com canal: ${comCanal}`)
  console.log(`banco: ${resumo.com_canal} de ${resumo.total} leads com canal (${Math.round(resumo.com_canal / Math.max(1, resumo.total) * 100)}%)`)
  await sql.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await sql.end({ timeout: 5 })
  process.exit(1)
})
