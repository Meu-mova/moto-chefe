import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { motos, modelos, usuarios, lojas } from '@/lib/db/schema'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

export type MontagemPorMecanico = {
  mecanicoId: string
  mecanico: string
  loja: string | null
  total: number
  /** Dias distintos em que montou algo no período — separa quem monta todo dia de quem fez tudo num dia. */
  diasTrabalhados: number
  primeira: string | null
  ultima: string | null
}

export type MontagemDetalhe = {
  chassi: string
  modelo: string
  marca: string
  cor: string
  loja: string | null
  mecanico: string
  data: string
}

/**
 * Montagens de motos por mecânico no período.
 *
 * A fonte é `motos.responsavel_montagem_id` + `motos.data_montagem`, gravados
 * quando a moto muda para "montada" (o mecânico é obrigatório nessa transição).
 *
 * `data_montagem` é um DATE, não timestamp: comparar com string 'YYYY-MM-DD'
 * evita o deslocamento de fuso que aconteceria convertendo para Date em BRT.
 */
export async function montagensPorMecanico(params: {
  lojaIds: string[]
  dataInicio?: string
  dataFim?: string
}): Promise<MontagemPorMecanico[]> {
  if (params.lojaIds.length === 0) return []

  const linhas = await db
    .select({
      mecanicoId: usuarios.id,
      mecanico: usuarios.nome,
      loja: lojas.nome,
      total: sql<number>`count(*)::int`,
      diasTrabalhados: sql<number>`count(distinct ${motos.dataMontagem})::int`,
      primeira: sql<string | null>`min(${motos.dataMontagem})::text`,
      ultima: sql<string | null>`max(${motos.dataMontagem})::text`,
    })
    .from(motos)
    .innerJoin(usuarios, eq(usuarios.id, motos.responsavelMontagemId))
    .leftJoin(lojas, eq(lojas.id, usuarios.lojaId))
    .where(and(
      inArray(motos.lojaId, params.lojaIds),
      isNotNull(motos.dataMontagem),
      params.dataInicio ? gte(motos.dataMontagem, params.dataInicio) : undefined,
      params.dataFim ? lte(motos.dataMontagem, params.dataFim) : undefined,
    ))
    .groupBy(usuarios.id, usuarios.nome, lojas.nome)
    .orderBy(desc(sql`count(*)`))

  return linhas
}

/** As montagens do período, uma linha por moto — o detalhe atrás do número. */
export async function montagensDetalhadas(params: {
  lojaIds: string[]
  dataInicio?: string
  dataFim?: string
  mecanicoId?: string
}): Promise<MontagemDetalhe[]> {
  if (params.lojaIds.length === 0) return []

  return db
    .select({
      chassi: motos.chassi,
      modelo: nomeDoModeloNaLoja(motos.lojaId),
      marca: modelos.marca,
      cor: motos.cor,
      loja: lojas.nome,
      mecanico: usuarios.nome,
      data: sql<string>`${motos.dataMontagem}::text`,
    })
    .from(motos)
    .innerJoin(usuarios, eq(usuarios.id, motos.responsavelMontagemId))
    .innerJoin(modelos, eq(modelos.id, motos.modeloId))
    .leftJoin(lojas, eq(lojas.id, motos.lojaId))
    .where(and(
      inArray(motos.lojaId, params.lojaIds),
      isNotNull(motos.dataMontagem),
      params.dataInicio ? gte(motos.dataMontagem, params.dataInicio) : undefined,
      params.dataFim ? lte(motos.dataMontagem, params.dataFim) : undefined,
      params.mecanicoId ? eq(motos.responsavelMontagemId, params.mecanicoId) : undefined,
    ))
    .orderBy(desc(motos.dataMontagem), asc(usuarios.nome))
    .limit(500)
}
