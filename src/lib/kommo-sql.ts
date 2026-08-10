import { sql, type SQL } from 'drizzle-orm'

// Estado de resposta por lead: 1º contato do cliente e 1ª resposta humana.
// LEAST/COALESCE = incremental-safe (nunca atrasa o 1º contato nem reescreve a
// 1ª resposta já conhecida).
//
// sql.param() é obrigatório nos três arrays: array JS solto dentro do sql`` o
// drizzle expande em `($1, $2, $3)`, que é row constructor, e `(...)::bigint[]`
// é SQL inválido. Sem isso o UPDATE estoura em toda execução.
export function sqlEstadoRespostaLead(ids: number[], fins: string[], frs: (string | null)[]): SQL {
  return sql`
    UPDATE kommo_leads k SET
      primeiro_incoming_em = LEAST(COALESCE(k.primeiro_incoming_em, 'infinity'::timestamptz), t.fin::timestamptz),
      primeira_resposta_em = COALESCE(k.primeira_resposta_em, t.fr::timestamptz)
    FROM unnest(${sql.param(ids)}::bigint[], ${sql.param(fins)}::text[], ${sql.param(frs)}::text[]) AS t(id, fin, fr)
    WHERE k.lead_id = t.id`
}
