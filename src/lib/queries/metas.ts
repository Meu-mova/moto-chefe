import { db } from '@/lib/db'
import { metasLoja, lojas, vendas } from '@/lib/db/schema'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { LinhaMetaLoja } from '@/lib/meta-vendas'

/**
 * Metas de venda por loja e o realizado do mês.
 *
 * O mês é sempre o do calendário de Brasília — quem chama passa ano/mês já
 * resolvidos por hojeEmBrasilia(). As bordas do intervalo são construídas em UTC
 * porque `vendas.data_venda` é gravado assim; ver [[feedback_input_date_timezone]]
 * para o estrago que meia-noite local causa aqui.
 */

/** Primeiro instante do mês e o do mês seguinte — o intervalo [início, fim). */
function bordasDoMes(ano: number, mes: number) {
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 1)),
  }
}

/** Metas cadastradas no mês, por lojaId. Loja sem linha não aparece no mapa. */
export async function metasDoMes(lojaIds: string[], ano: number, mes: number) {
  if (lojaIds.length === 0) return new Map<string, number>()
  const linhas = await db
    .select({ lojaId: metasLoja.lojaId, valorMeta: metasLoja.valorMeta })
    .from(metasLoja)
    .where(and(
      inArray(metasLoja.lojaId, lojaIds),
      eq(metasLoja.ano, ano),
      eq(metasLoja.mes, mes),
    ))
  return new Map(linhas.map(l => [l.lojaId, Number(l.valorMeta)]))
}

/**
 * Faturamento do mês por loja, em valor cheio (`vendas.valor`) — a mesma medida
 * que a meta usa. Loja sem venda não aparece no mapa.
 */
export async function realizadoDoMes(lojaIds: string[], ano: number, mes: number) {
  if (lojaIds.length === 0) return new Map<string, number>()
  const { inicio, fim } = bordasDoMes(ano, mes)
  const linhas = await db
    .select({ lojaId: vendas.lojaId, total: sql<string>`coalesce(sum(${vendas.valor}), 0)` })
    .from(vendas)
    .where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, inicio),
      lt(vendas.dataVenda, fim),
    ))
    .groupBy(vendas.lojaId)
  return new Map(linhas.map(l => [l.lojaId, Number(l.total)]))
}

/** Faturamento de um único dia, somando as lojas — o card "Vendas Hoje". */
export async function vendidoNoDia(lojaIds: string[], ano: number, mes: number, dia: number) {
  if (lojaIds.length === 0) return 0
  const [linha] = await db
    .select({ total: sql<string>`coalesce(sum(${vendas.valor}), 0)` })
    .from(vendas)
    .where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, new Date(Date.UTC(ano, mes - 1, dia))),
      lt(vendas.dataVenda, new Date(Date.UTC(ano, mes - 1, dia + 1))),
    ))
  return Number(linha?.total ?? 0)
}

/**
 * Uma linha por loja do grupo, com meta e realizado do mês — o insumo de
 * montarMetaDoMes(). Loja sem meta vem com meta 0 e é descartada lá; loja sem
 * venda vem com realizado 0.
 */
export async function linhasMetaDoMes(
  lojaIds: string[], ano: number, mes: number,
): Promise<LinhaMetaLoja[]> {
  if (lojaIds.length === 0) return []
  const [nomes, metas, realizado] = await Promise.all([
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIds)),
    metasDoMes(lojaIds, ano, mes),
    realizadoDoMes(lojaIds, ano, mes),
  ])
  return nomes.map(l => ({
    lojaId: l.id,
    loja: l.nome,
    meta: metas.get(l.id) ?? 0,
    realizado: realizado.get(l.id) ?? 0,
  }))
}
