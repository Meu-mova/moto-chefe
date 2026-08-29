import { db } from '@/lib/db'
import { documentosAssinatura, lojas, usuarios, vendas } from '@/lib/db/schema'
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import { calcStatusMultiPagamento } from '@/lib/conciliacao-status'
import { inicioDoDiaBrt } from '@/lib/data-venda'
import { CORTE_MIGRACAO_PIX } from '@/lib/pix'
import {
  INICIO_REGRA_DOCUMENTOS,
  pendenciasDaVenda,
  type Pendencia,
} from '@/lib/pendencias-venda'

export type VendaPendente = {
  id: string
  numero: number
  clienteNome: string
  lojaNome: string
  vendedorNome: string
  dataVenda: Date
  liberada: boolean
  pendencias: Pendencia[]
}

export type LinhaVendedor = {
  vendedorId: string
  nome: string
  total: number
  efetivadas: number
  contrato: number
  checklist: number
  nf: number
  conciliacao: number
}

export type PainelPendencias = {
  desde: string
  total: number
  efetivadas: number
  pendentes: number
  porTipo: Record<Pendencia, number>
  vendas: VendaPendente[]
  porVendedor: LinhaVendedor[]
}

/**
 * Situação das vendas desde que contrato e checklist entraram no ar.
 *
 * Sempre conta de INICIO_REGRA_DOCUMENTOS até hoje, de propósito: o filtro de
 * data do dashboard não mexe aqui, senão a pendência de agosto sumiria da tela
 * em setembro sem ninguém ter resolvido nada.
 */
export async function pendenciasDeVendas(
  { lojaIds, vendedorId }: { lojaIds: string[]; vendedorId?: string },
): Promise<PainelPendencias> {
  const vazio: PainelPendencias = {
    desde: INICIO_REGRA_DOCUMENTOS,
    total: 0, efetivadas: 0, pendentes: 0,
    porTipo: { contrato: 0, checklist: 0, nf: 0, conciliacao: 0 },
    vendas: [], porVendedor: [],
  }
  if (lojaIds.length === 0) return vazio

  const linhas = await db
    .select({
      id: vendas.id,
      numero: vendas.numero,
      clienteNome: vendas.clienteNome,
      dataVenda: vendas.dataVenda,
      valor: vendas.valor,
      pagamentos: vendas.pagamentos,
      notaFiscalSaida: vendas.notaFiscalSaida,
      nfLiberadaEm: vendas.nfLiberadaEm,
      lojaNome: lojas.nome,
      vendedorId: vendas.vendedorId,
      vendedorNome: usuarios.nome,
      contratoAssinado: sql<boolean>`EXISTS (
        SELECT 1 FROM ${documentosAssinatura} d
        WHERE d.venda_id = ${sql.raw('"vendas"."id"')}
          AND d.tipo = 'contrato_venda' AND d.status = 'assinado'
      )`,
      checklistAssinado: sql<boolean>`EXISTS (
        SELECT 1 FROM ${documentosAssinatura} d
        WHERE d.venda_id = ${sql.raw('"vendas"."id"')}
          AND d.tipo = 'checklist_entrega' AND d.status = 'assinado'
      )`,
      // "vendas"."id" qualificado: sem isso o drizzle renderiza só "id" e a
      // subconsulta casa com o id da tabela interna. Ver getPendenciasConciliacaoLoja.
      conciliadoValor: sql<number>`COALESCE((
        SELECT SUM(valor_bruto::numeric) FROM conciliacoes_cartao
        WHERE venda_id = ${sql.raw('"vendas"."id"')} AND conciliado = true
      ), 0)`,
      pixConciliadoValor: sql<number>`CASE WHEN ${vendas.dataVenda} >= ${CORTE_MIGRACAO_PIX.toISOString()}
        THEN COALESCE((SELECT SUM(valor::numeric) FROM pix_recebimentos_mcp WHERE venda_id = ${sql.raw('"vendas"."id"')}), 0)
        ELSE COALESCE((SELECT SUM(valor::numeric) FROM pix_recebimentos WHERE venda_id = ${sql.raw('"vendas"."id"')}), 0)
      END`,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, inicioDoDiaBrt(INICIO_REGRA_DOCUMENTOS)),
      vendedorId ? eq(vendas.vendedorId, vendedorId) : undefined,
    ))
    .orderBy(asc(vendas.dataVenda))

  const porTipo: Record<Pendencia, number> = { contrato: 0, checklist: 0, nf: 0, conciliacao: 0 }
  const porVendedor = new Map<string, LinhaVendedor>()
  const pendentes: VendaPendente[] = []

  for (const l of linhas) {
    const statusConciliacao = calcStatusMultiPagamento(
      l.pagamentos, l.conciliadoValor, l.pixConciliadoValor, l.valor,
    )
    const faltando = pendenciasDaVenda({
      contratoAssinado: l.contratoAssinado,
      checklistAssinado: l.checklistAssinado,
      notaFiscalSaida: l.notaFiscalSaida,
      nfLiberadaEm: l.nfLiberadaEm,
      statusConciliacao,
    })

    const linha = porVendedor.get(l.vendedorId) ?? {
      vendedorId: l.vendedorId, nome: l.vendedorNome,
      total: 0, efetivadas: 0, contrato: 0, checklist: 0, nf: 0, conciliacao: 0,
    }
    linha.total++
    if (faltando.length === 0) linha.efetivadas++
    for (const p of faltando) { porTipo[p]++; linha[p]++ }
    porVendedor.set(l.vendedorId, linha)

    if (faltando.length > 0) {
      pendentes.push({
        id: l.id,
        numero: l.numero,
        clienteNome: l.clienteNome,
        lojaNome: l.lojaNome,
        vendedorNome: l.vendedorNome,
        dataVenda: l.dataVenda,
        liberada: l.nfLiberadaEm != null,
        pendencias: faltando,
      })
    }
  }

  const efetivadas = linhas.length - pendentes.length
  return {
    desde: INICIO_REGRA_DOCUMENTOS,
    total: linhas.length,
    efetivadas,
    pendentes: pendentes.length,
    porTipo,
    vendas: pendentes,
    // Quem tem mais pendência aparece primeiro — é a lista de cobrança.
    porVendedor: [...porVendedor.values()].sort(
      (a, b) => (b.total - b.efetivadas) - (a.total - a.efetivadas) || b.total - a.total,
    ),
  }
}
