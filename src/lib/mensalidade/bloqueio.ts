import { sql } from 'drizzle-orm'
import { execRows } from '@/lib/db'
import { hojeBrt } from '@/lib/data-venda'
import { estaBloqueado } from './regras'

/**
 * O grupo está bloqueado por falta de pagamento? Grupo isento nunca bloqueia. Roda no
 * layout em toda página, para o grupo ativo: uma consulta só.
 */
export async function grupoBloqueado(grupoId: string, agora: Date = new Date()): Promise<boolean> {
  const linhas = await execRows(sql`
    select m.vencimento::text as vencimento
    from mensalidades m
    left join mensalidade_config c on c.grupo_id = m.grupo_id
    where m.grupo_id = ${grupoId} and m.status = 'aberta' and not coalesce(c.isento, false)
  `) as { vencimento: string }[]
  return estaBloqueado(linhas.map(l => l.vencimento), hojeBrt(agora))
}
