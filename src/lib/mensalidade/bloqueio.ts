import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { estaBloqueado } from './regras'

type Executor = Pick<typeof db, 'select'>

// Qualificado à mão: sem join, ${mensalidades.grupoId} sairia "grupo_id" e casaria com
// a coluna da subconsulta (AGENTS.md, armadilhas do Drizzle).
const naoIsento = sql`not exists (
  select 1 from mensalidade_config c where c.grupo_id = ${sql.raw('"mensalidades"."grupo_id"')} and c.isento
)`

/**
 * Mensalidades em aberto que contam para cobrança e bloqueio: grupo isento fica de
 * fora. É o único lugar da regra; layout, /mensalidade e o botão Pagar passam por aqui.
 */
export async function abertasCobraveis(
  filtro: { grupoIds: string[]; mensalidadeId?: string },
  exec: Executor = db,
) {
  if (filtro.grupoIds.length === 0) return []
  return exec.select({ m: mensalidades, grupoNome: grupos.nome })
    .from(mensalidades).innerJoin(grupos, eq(grupos.id, mensalidades.grupoId))
    .where(and(
      inArray(mensalidades.grupoId, filtro.grupoIds),
      eq(mensalidades.status, 'aberta'),
      filtro.mensalidadeId ? eq(mensalidades.id, filtro.mensalidadeId) : undefined,
      naoIsento,
    ))
    .orderBy(asc(mensalidades.vencimento))
}

/** O grupo está bloqueado por falta de pagamento? Roda no layout em toda página. */
export async function grupoBloqueado(grupoId: string, agora: Date = new Date(), exec: Executor = db): Promise<boolean> {
  const abertas = await abertasCobraveis({ grupoIds: [grupoId] }, exec)
  return estaBloqueado(abertas.map(a => a.m.vencimento), hojeBrt(agora))
}
