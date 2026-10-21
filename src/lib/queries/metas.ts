import { db } from '@/lib/db'
import { metasLoja, lojas, vendas } from '@/lib/db/schema'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { LinhaMetaLoja } from '@/lib/meta-vendas'
import { inicioDoDiaBrt } from '@/lib/data-venda'

/**
 * Metas de venda por loja e o realizado do mês.
 *
 * O mês é sempre o do calendário de Brasília — quem chama passa ano/mês já
 * resolvidos por hojeEmBrasilia(). As bordas também: o banco roda em UTC, e uma
 * borda à meia-noite UTC jogaria a venda das 21h do último dia no mês seguinte (#283).
 */

/** "YYYY-MM-DD" de uma data do calendário; Date.UTC só para normalizar o dia 32, o mês 13 etc. */
function diaIso(ano: number, mes: number, dia: number) {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10)
}

/** Meia-noite de Brasília do 1º dia do mês e do 1º do mês seguinte — o intervalo [início, fim). */
function bordasDoMes(ano: number, mes: number) {
  return {
    inicio: inicioDoDiaBrt(diaIso(ano, mes, 1)),
    fim: inicioDoDiaBrt(diaIso(ano, mes + 1, 1)),
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
      gte(vendas.dataVenda, inicioDoDiaBrt(diaIso(ano, mes, dia))),
      lt(vendas.dataVenda, inicioDoDiaBrt(diaIso(ano, mes, dia + 1))),
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
