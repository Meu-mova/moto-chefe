import { sql, type SQL } from 'drizzle-orm'

// Estado de resposta por lead: 1º contato do cliente e 1ª resposta.
// LEAST nos dois campos = incremental-safe e auto-corretivo: guarda sempre o
// instante mais antigo conhecido, então uma janela que enxerga só o meio da
// conversa nunca atrasa o registro. LEAST ignora NULL, então serve tanto para
// preencher campo vazio quanto para adiantar valor que ficou tarde demais —
// foi o que corrigiu a 1ª resposta gravada sob a regra antiga, que só aceitava
// mensagem com autor identificado.
//
// sql.param() é obrigatório nos três arrays: array JS solto dentro do sql`` o
// drizzle expande em `($1, $2, $3)`, que é row constructor, e `(...)::bigint[]`
// é SQL inválido. Sem isso o UPDATE estoura em toda execução.
export function sqlEstadoRespostaLead(ids: number[], fins: string[], frs: (string | null)[]): SQL {
  return sql`
    UPDATE kommo_leads k SET
      primeiro_incoming_em = LEAST(k.primeiro_incoming_em, t.fin::timestamptz),
      primeira_resposta_em = LEAST(k.primeira_resposta_em, t.fr::timestamptz)
    FROM unnest(${sql.param(ids)}::bigint[], ${sql.param(fins)}::text[], ${sql.param(frs)}::text[]) AS t(id, fin, fr)
    WHERE k.lead_id = t.id`
}
