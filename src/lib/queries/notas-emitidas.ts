import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fimDoDiaBrt, inicioDoDiaBrt } from '@/lib/data-venda'
import { grupos, motos, notasFiscaisSaida, vendas } from '@/lib/db/schema'
import { classificarNota, notasDoLote, type CategoriaNota, type Situacao } from '@/lib/notas-emitidas'

type Executor = Pick<typeof db, 'select'>

export type NotaEmitida = {
  id: string
  numero: string | null
  serie: string | null
  status: string
  categoria: CategoriaNota
  motivoStatus: string | null
  criadoEm: string
  linkDanfe: string | null
  linkXml: string | null
  vendaId: string | null
  vendaNumero: number | null
  clienteNome: string | null
  chassi: string | null
  dataVenda: string | null
}

/** Teto da lista: a tela não pagina ainda, e um grupo emite poucas centenas de notas por ano. */
export const LIMITE_DA_LISTA = 500

type FiltroNotas = { grupoId: string; contaId: string | null; ambiente: 'Producao' | 'Homologacao'; de: string; ate: string }

// Pede o join com grupos: a Conta é conferida pelo grupo da nota.
function doFiltro(filtro: FiltroNotas) {
  return and(
    eq(notasFiscaisSaida.grupoId, filtro.grupoId),
    eq(notasFiscaisSaida.ambiente, filtro.ambiente),
    sql`${notasFiscaisSaida.criadoEm} >= ${inicioDoDiaBrt(filtro.de).toISOString()}::timestamptz`,
    sql`${notasFiscaisSaida.criadoEm} <= ${fimDoDiaBrt(filtro.ate).toISOString()}::timestamptz`,
    filtro.contaId === null ? undefined : eq(grupos.contaId, filtro.contaId),
  )
}

/**
 * NF de saída do grupo emitidas no período (dias de Brasília, "AAAA-MM-DD"), mais recentes primeiro. `contaId` null só para admin_geral;
 * fora isso, o grupo precisa ser da Conta, conferido na própria consulta.
 */
export async function listarNotasEmitidas(
  filtro: FiltroNotas,
  exec: Executor = db,
  // null: sem teto, para o download do filtro inteiro (#402).
  limite: number | null = LIMITE_DA_LISTA,
): Promise<NotaEmitida[]> {
  const consulta = exec
    .select({
      id: notasFiscaisSaida.id,
      numero: notasFiscaisSaida.numero,
      serie: notasFiscaisSaida.serie,
      status: notasFiscaisSaida.status,
      motivoStatus: notasFiscaisSaida.motivoStatus,
      criadoEm: notasFiscaisSaida.criadoEm,
      linkDanfe: notasFiscaisSaida.linkDanfe,
      linkXml: notasFiscaisSaida.linkXml,
      vendaId: vendas.id,
      vendaNumero: vendas.numero,
      clienteNome: vendas.clienteNome,
      chassi: motos.chassi,
      dataVenda: vendas.dataVenda,
    })
    .from(notasFiscaisSaida)
    .innerJoin(grupos, eq(grupos.id, notasFiscaisSaida.grupoId))
    // LEFT: a #347 vai manter a nota da venda cancelada, com venda_id nulo.
    .leftJoin(vendas, eq(vendas.id, notasFiscaisSaida.vendaId))
    .leftJoin(motos, eq(motos.id, vendas.motoId))
    .where(doFiltro(filtro))
    .orderBy(desc(notasFiscaisSaida.criadoEm))
  const linhas = await (limite === null ? consulta : consulta.limit(limite))

  return linhas.map(l => ({ ...l, criadoEm: l.criadoEm.toISOString(), dataVenda: l.dataVenda?.toISOString() ?? null, categoria: classificarNota(l.status) }))
}

/** Notas do download (#402): a lista da tela sem o teto, presa à Conta na consulta, com a seleção aplicada por cima. */
export async function notasParaBaixar(
  filtro: FiltroNotas,
  pedido: { situacao: Situacao; ids: string[] },
  exec: Executor = db,
): Promise<NotaEmitida[]> {
  return notasDoLote(await listarNotasEmitidas(filtro, exec, null), pedido)
}

/** Total do filtro por categoria, sem o teto da lista: a tela mostra o total mesmo acima de 500 (#402). */
export async function contarPorCategoria(filtro: FiltroNotas, exec: Executor = db): Promise<Record<CategoriaNota, number>> {
  const linhas = await exec
    .select({ status: notasFiscaisSaida.status, total: sql<number>`count(*)::int` })
    .from(notasFiscaisSaida)
    .innerJoin(grupos, eq(grupos.id, notasFiscaisSaida.grupoId))
    .where(doFiltro(filtro))
    .groupBy(notasFiscaisSaida.status)
  const contagem: Record<CategoriaNota, number> = { autorizada: 0, cancelada: 0, recusada: 0, em_andamento: 0, descartada: 0 }
  for (const l of linhas) contagem[classificarNota(l.status)] += l.total
  return contagem
}
