import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { estaBloqueado, valorAtualizado } from './regras'

type Executor = Pick<typeof db, 'select'>
type Mensalidade = typeof mensalidades.$inferSelect

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

export type SituacaoMensalidade = {
  /** O grupo ativo está bloqueado por falta de pagamento. */
  bloqueado: boolean
  /** A mensalidade em aberto mais antiga do grupo ativo, para a faixa do topo. */
  aberta: { vencimento: string; total: number } | null
  /** Outros grupos que o usuário enxerga com mensalidade em aberto (variante B, 19/10/2026). */
  outros: { nome: string; bloqueado: boolean }[]
}

export const SEM_MENSALIDADE: SituacaoMensalidade = { bloqueado: false, aberta: null, outros: [] }

/**
 * Mensalidades em aberto do grupo ativo e dos outros grupos visíveis, numa consulta só:
 * roda no layout em toda página.
 */
export async function situacaoMensalidade(
  grupoAtivoId: string, gruposVisiveis: string[], agora: Date = new Date(), exec: Executor = db,
): Promise<SituacaoMensalidade> {
  const ids = gruposVisiveis.includes(grupoAtivoId) ? gruposVisiveis : [grupoAtivoId, ...gruposVisiveis]
  const linhas = await abertasCobraveis({ grupoIds: ids }, exec)
  const hoje = hojeBrt(agora)
  const doAtivo = linhas.filter(l => l.m.grupoId === grupoAtivoId)
  const primeira = doAtivo[0]?.m
  const outros = new Map<string, { nome: string; abertas: Mensalidade[] }>()
  for (const l of linhas) {
    if (l.m.grupoId === grupoAtivoId) continue
    const o = outros.get(l.m.grupoId) ?? { nome: l.grupoNome, abertas: [] }
    o.abertas.push(l.m)
    outros.set(l.m.grupoId, o)
  }
  return {
    bloqueado: estaBloqueado(doAtivo.map(l => l.m), hoje),
    aberta: primeira ? { vencimento: primeira.vencimento, total: valorAtualizado(primeira, hoje).total } : null,
    outros: [...outros.values()].map(o => ({ nome: o.nome, bloqueado: estaBloqueado(o.abertas, hoje) })),
  }
}
