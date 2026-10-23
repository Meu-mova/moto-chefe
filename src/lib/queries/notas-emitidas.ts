import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fimDoDiaBrt, inicioDoDiaBrt } from '@/lib/data-venda'
import { grupos, motos, notasFiscaisSaida, vendas } from '@/lib/db/schema'
import { classificarNota, type CategoriaNota } from '@/lib/notas-emitidas'

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
const LIMITE = 500

/**
 * NF de saída do grupo emitidas no período (dias de Brasília, "AAAA-MM-DD"), mais recentes primeiro. `contaId` null só para admin_geral;
 * fora isso, o grupo precisa ser da Conta, conferido na própria consulta.
 */
export async function listarNotasEmitidas(
  filtro: { grupoId: string; contaId: string | null; ambiente: 'Producao' | 'Homologacao'; de: string; ate: string },
  exec: Executor = db,
): Promise<NotaEmitida[]> {
  const linhas = await exec
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
    .where(and(
      eq(notasFiscaisSaida.grupoId, filtro.grupoId),
      eq(notasFiscaisSaida.ambiente, filtro.ambiente),
      sql`${notasFiscaisSaida.criadoEm} >= ${inicioDoDiaBrt(filtro.de).toISOString()}::timestamptz`,
      sql`${notasFiscaisSaida.criadoEm} <= ${fimDoDiaBrt(filtro.ate).toISOString()}::timestamptz`,
      filtro.contaId === null ? undefined : eq(grupos.contaId, filtro.contaId),
    ))
    .orderBy(desc(notasFiscaisSaida.criadoEm))
    .limit(LIMITE)

  return linhas.map(l => ({ ...l, criadoEm: l.criadoEm.toISOString(), dataVenda: l.dataVenda?.toISOString() ?? null, categoria: classificarNota(l.status) }))
}
