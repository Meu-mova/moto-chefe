import { db, execRows } from '@/lib/db'
import { vendas, motos, transferencias, garantias, ordensServico, lancamentosCaixa, lojas, modelos, pedidosVenda, usuarios, conciliacoesCartao, vendasPecas } from '@/lib/db/schema'
import { eq, and, gte, lte, ne, sql, count, sum, inArray, or, avg, desc, SQL } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'
import { calcStatusMultiPagamento, pagamentosEfetivosOS } from '@/lib/conciliacao-status'
import { valorLiquidoExpr } from './valor-liquido'

type Filtros = {
  dataInicio: string
  dataFim: string
  lojaId?: string[]
  vendedorId?: string
}

// Valor líquido por venda: parte não paga em cartão fica como está (bruto = líquido);
// a parte paga em cartão e já conciliada é trocada pelo valor líquido (descontada a taxa da operadora).
// Cobre também vendas com forma "multiplos" (cartão + pix/dinheiro), onde a parte não-cartão não pode
// ser descartada do total.
function lojaFilter(col: Column, ids: string[]) {
  return ids.length === 1 ? eq(col, ids[0]) : inArray(col, ids)
}

export async function getKPIs(filtros: Filtros, opts?: { useLiquidoValue?: boolean }) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const useLiquido = opts?.useLiquidoValue ?? false
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const vendasCond = and(
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
    lojaId !== undefined ? lojaFilter(vendas.lojaId, lojaId) : undefined,
    vendedorId ? eq(vendas.vendedorId, vendedorId) : undefined,
  )

  const estoqueCond = and(
    sql`${motos.status} != 'vendida'`,
    sql`(${motos.disponibilidade} IS NULL OR ${motos.disponibilidade} != 'vendida')`,
    eq(motos.somenteGarantia, false), // moto só de garantia não é estoque
    lojaId !== undefined ? lojaFilter(motos.lojaId, lojaId) : undefined,
  )

  const transfCond = and(
    eq(transferencias.status, 'pendente'),
    lojaId !== undefined
      ? or(lojaFilter(transferencias.lojaOrigemId, lojaId)!, lojaFilter(transferencias.lojaDestinoId, lojaId)!)
      : undefined,
  )

  const garantiaCond = and(
    eq(garantias.status, 'ativa'),
    lojaId !== undefined ? lojaFilter(garantias.lojaId, lojaId) : undefined,
  )

  const osCond = and(
    inArray(ordensServico.status, ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento']),
    lojaId !== undefined ? lojaFilter(ordensServico.lojaId, lojaId) : undefined,
  )

  // Uma única query com UNION ALL — 1 round-trip ao banco em vez de 5
  const valorV = useLiquido ? valorLiquidoExpr() : sql`${vendas.valor}`
  const rows = await execRows(sql`
    SELECT 'v'  AS t, count(*)::int AS n, coalesce(sum(${valorV}), 0)::numeric AS val FROM ${vendas} WHERE ${vendasCond}
    UNION ALL
    SELECT 'e',        count(*)::int,     coalesce(sum(${motos.precoCompra}),  0)::numeric        FROM ${motos}          WHERE ${estoqueCond}
    UNION ALL
    SELECT 'tr',       count(*)::int,     0                                                        FROM ${transferencias} WHERE ${transfCond}
    UNION ALL
    SELECT 'g',        count(*)::int,     0                                                        FROM ${garantias}      WHERE ${garantiaCond}
    UNION ALL
    SELECT 'os',       count(*)::int,     0                                                        FROM ${ordensServico}  WHERE ${osCond}
  `)

  const m: Record<string, { n: number; val: string }> = {}
  for (const row of rows as any[]) m[row.t] = row

  return {
    totalVendas:             Number(m.v?.n  ?? 0),
    faturamento:             Number(m.v?.val ?? 0),
    estoque:                 Number(m.e?.n  ?? 0),
    valorEstoque:            Number(m.e?.val ?? 0),
    transferenciasPendentes: Number(m.tr?.n ?? 0),
    garantiasAtivas:         Number(m.g?.n  ?? 0),
    osAbertas:               Number(m.os?.n ?? 0),
  }
}

/** useLiquidoValue: a mesma base do faturamento do vendedor em getKPIs, para a série bater com o número. */
export async function getVendasPorDia(filtros: Filtros, opts?: { useLiquidoValue?: boolean }) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) conditions.push(eq(vendas.vendedorId, vendedorId))

  const rows = await db
    .select({
      dia: sql<string>`to_char(${vendas.dataVenda}, 'YYYY-MM-DD')`,
      total: count(),
      valor: opts?.useLiquidoValue ? sql<string>`sum(${valorLiquidoExpr()})` : sum(vendas.valor),
    })
    .from(vendas)
    .where(and(...conditions))
    .groupBy(sql`to_char(${vendas.dataVenda}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${vendas.dataVenda}, 'YYYY-MM-DD')`)

  return rows.map(r => ({
    dia: r.dia,
    total: r.total,
    valor: Number(r.valor ?? 0),
  }))
}

export async function getEstoquePorLoja(lojaId?: string[]) {
  const conditions: any[] = [
    sql`${motos.disponibilidade} IS NULL OR ${motos.disponibilidade} != 'vendida'`,
    eq(motos.somenteGarantia, false), // moto só de garantia não é estoque
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(motos.lojaId, lojaId)!)

  return db
    .select({
      loja: lojas.nome,
      total: count(),
    })
    .from(motos)
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(and(...conditions))
    .groupBy(lojas.nome)
    .orderBy(lojas.nome)
}

// Saldo de caixa atual (todos os tempos, não filtrado pelo período do dashboard) por loja —
// mesma lógica de src/app/(dashboard)/caixa/page.tsx, agregada por loja em vez de uma só.
export async function getSaldoCaixaPorLoja(lojaId?: string[]) {
  const conditions = [ne(lancamentosCaixa.statusAprovacao, 'reprovado')]
  if (lojaId !== undefined) conditions.push(lojaFilter(lancamentosCaixa.lojaId, lojaId)!)

  return db
    .select({
      loja: lojas.nome,
      saldo: sql<string>`COALESCE(SUM(
        CASE WHEN ${lancamentosCaixa.tipo} = 'entrada'
          THEN ${lancamentosCaixa.valor}::numeric
          ELSE -${lancamentosCaixa.valor}::numeric
        END
      ), 0)`,
    })
    .from(lancamentosCaixa)
    .innerJoin(lojas, eq(lancamentosCaixa.lojaId, lojas.id))
    .where(and(...conditions))
    .groupBy(lojas.nome)
    .orderBy(lojas.nome)
}

export async function getUltimasVendas(filtros: Filtros, limite = 5) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) conditions.push(eq(vendas.vendedorId, vendedorId))

  return db
    .select({
      id: vendas.id,
      clienteNome: vendas.clienteNome,
      valor: sql<string>`${valorLiquidoExpr()}`,
      dataVenda: vendas.dataVenda,
      loja: lojas.nome,
      modelo: modelos.modelo,
      chassi: motos.chassi,
      vendedor: usuarios.nome,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .where(and(...conditions))
    .orderBy(sql`${vendas.dataVenda} DESC`)
    .limit(limite)
}

export async function getTransferenciasPendentes(lojaId?: string[], limite = 5) {
  const conditions = [eq(transferencias.status, 'pendente')]
  if (lojaId !== undefined) {
    conditions.push(
      or(
        lojaFilter(transferencias.lojaOrigemId, lojaId)!,
        lojaFilter(transferencias.lojaDestinoId, lojaId)!,
      )!
    )
  }

  const lojaOrigem = db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .as('loja_origem')

  const lojaDestino = db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .as('loja_destino')

  return db
    .select({
      id: transferencias.id,
      chassi: motos.chassi,
      modelo: modelos.modelo,
      lojaOrigem: lojaOrigem.nome,
      lojaDestino: lojaDestino.nome,
      dataSolicitacao: transferencias.dataSolicitacao,
    })
    .from(transferencias)
    .innerJoin(motos, eq(transferencias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojaOrigem, eq(transferencias.lojaOrigemId, lojaOrigem.id))
    .innerJoin(lojaDestino, eq(transferencias.lojaDestinoId, lojaDestino.id))
    .where(and(...conditions))
    .orderBy(sql`${transferencias.dataSolicitacao} DESC`)
    .limit(limite)
}

export async function getGarantiasProxVencimento(lojaId?: string[], limite = 5) {
  const conditions = [
    eq(garantias.status, 'ativa'),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(garantias.lojaId, lojaId)!)

  return db
    .select({
      id: garantias.id,
      chassi: motos.chassi,
      modelo: modelos.modelo,
      loja: lojas.nome,
      dataFim: garantias.dataFim,
      descricao: garantias.descricao,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .where(and(...conditions))
    .orderBy(garantias.dataFim)
    .limit(limite)
}

export async function getOsAbertas(lojaId?: string[], mecanicoId?: string, limite = 5) {
  const conditions = [
    inArray(ordensServico.status, ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento']),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(ordensServico.lojaId, lojaId)!)
  if (mecanicoId) conditions.push(eq(ordensServico.mecanicoId, mecanicoId))

  return db
    .select({
      id: ordensServico.id,
      chassi: motos.chassi,
      modelo: modelos.modelo,
      loja: lojas.nome,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
    })
    .from(ordensServico)
    .innerJoin(motos, eq(ordensServico.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(ordensServico.lojaId, lojas.id))
    .where(and(...conditions))
    .orderBy(sql`${ordensServico.dataAbertura} DESC`)
    .limit(limite)
}

export async function getMotoMaisVendida(filtros: Filtros) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) conditions.push(eq(vendas.vendedorId, vendedorId))

  const [result] = await db
    .select({
      modelo: modelos.modelo,
      total: count(),
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(and(...conditions))
    .groupBy(modelos.modelo)
    .orderBy(desc(count()))
    .limit(1)

  return result ?? null
}

export async function getPrecoMedioVendas(filtros: Filtros, opts?: { useLiquidoValue?: boolean }) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) conditions.push(eq(vendas.vendedorId, vendedorId))

  const mediaExpr = opts?.useLiquidoValue
    ? sql<number>`AVG(${valorLiquidoExpr()})`
    : avg(vendas.valor)

  const [result] = await db
    .select({ media: mediaExpr })
    .from(vendas)
    .where(and(...conditions))

  return Number(result?.media ?? 0)
}

export async function getRankingVendedores(filtros: Omit<Filtros, 'vendedorId'>) {
  const { dataInicio, dataFim, lojaId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)

  const lojaVendedor = db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .as('loja_vendedor')

  return db
    .select({
      vendedorId: vendas.vendedorId,
      nome: usuarios.nome,
      loja: lojaVendedor.nome,
      totalVendas: count(),
      faturamento: sql<string>`sum(${valorLiquidoExpr()})`,
    })
    .from(vendas)
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .leftJoin(lojaVendedor, eq(usuarios.lojaId, lojaVendedor.id))
    .where(and(...conditions))
    .groupBy(vendas.vendedorId, usuarios.nome, lojaVendedor.nome)
    .orderBy(sql`sum(${valorLiquidoExpr()}) DESC`)
}

export async function getModelosMaisVendidos(filtros: Filtros) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) conditions.push(eq(vendas.vendedorId, vendedorId))

  return db
    .select({
      modelo: modelos.modelo,
      marca: modelos.marca,
      totalVendas: count(),
      faturamento: sql<string>`sum(${valorLiquidoExpr()})`,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(and(...conditions))
    .groupBy(modelos.modelo, modelos.marca)
    .orderBy(desc(count()))
}

export async function getRankingLojas(filtros: Omit<Filtros, 'vendedorId'>) {
  const { dataInicio, dataFim, lojaId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [gte(vendas.dataVenda, inicio), lte(vendas.dataVenda, fim)]
  if (lojaId !== undefined) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)

  return db
    .select({
      lojaId: vendas.lojaId,
      loja: lojas.nome,
      totalVendas: count(),
      faturamento: sql<string>`sum(${valorLiquidoExpr()})`,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(and(...conditions))
    .groupBy(vendas.lojaId, lojas.nome)
    .orderBy(sql`sum(${valorLiquidoExpr()}) DESC`)
}

// Faturamento de Ordens de Serviço — só conta OS já paga/concluída (status 'concluida'),
// não as que ainda estão abertas/em andamento/aguardando pagamento.
export async function getFaturamentoOS(filtros: Filtros) {
  const { dataInicio, dataFim, lojaId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    eq(ordensServico.status, 'concluida'),
    gte(ordensServico.dataConclusao, inicio),
    lte(ordensServico.dataConclusao, fim),
  ]
  if (lojaId !== undefined) conditions.push(lojaFilter(ordensServico.lojaId, lojaId)!)

  const [result] = await db
    .select({
      servicos: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}), 0)`,
      pecas:    sql<string>`COALESCE(SUM(${ordensServico.valorPecas}), 0)`,
    })
    .from(ordensServico)
    .where(and(...conditions))

  return { servicos: Number(result?.servicos ?? 0), pecas: Number(result?.pecas ?? 0) }
}

// Pendências de conciliação de uma loja específica, últimos N dias (parâmetro `desde`).
// Reaproveita os mesmos helpers de status usados em /vendas, /ordens-servico e /pecas —
// não inventa critério novo. Usado só pelo card do aux_adm no Dashboard.
export async function getPendenciasConciliacaoLoja(lojaId: string, desde: Date) {
  const [vendasRows, osRows, pecasRows] = await Promise.all([
    db
      .select({
        pagamentos: vendas.pagamentos,
        valor: vendas.valor,
        notaFiscalSaida: vendas.notaFiscalSaida,
        // Referência qualificada de propósito: sem joins, o drizzle renderiza
        // ${vendas.id} como "id" (sem tabela), e dentro da subconsulta esse "id"
        // casa com o id DA TABELA INTERNA (pix_recebimentos.id é text → crash
        // uuid=text; nas demais, compara venda_id = id e soma sempre 0). Precisa
        // ser "vendas"."id".
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE venda_id = ${sql.raw('"vendas"."id"')}
          AND conciliado = true
        ), 0)`,
        // Fonte única de PIX desde 15/09/2026, quando o ValidaPix saiu.
        pixConciliadoValor: sql<number>`COALESCE((SELECT SUM(valor::numeric) FROM pix_recebimentos_mcp WHERE venda_id = ${sql.raw('"vendas"."id"')}), 0)`,
      })
      .from(vendas)
      .where(and(eq(vendas.lojaId, lojaId), gte(vendas.dataVenda, desde))),
    db
      .select({
        formaPagamento: ordensServico.formaPagamento,
        pagamentos: ordensServico.pagamentos,
        valorTotal: ordensServico.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE os_id = ${sql.raw('"ordens_servico"."id"')}
          AND conciliado = true
        ), 0)`,
        pixConciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor::numeric)
          FROM pix_recebimentos_mcp
          WHERE os_id = ${sql.raw('"ordens_servico"."id"')}
        ), 0)`,
      })
      .from(ordensServico)
      .where(and(eq(ordensServico.lojaId, lojaId), gte(ordensServico.dataAbertura, desde))),
    db
      .select({
        pagamentos: vendasPecas.pagamentos,
        valorTotal: vendasPecas.valorTotal,
        conciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor_bruto::numeric)
          FROM conciliacoes_cartao
          WHERE peca_venda_id = ${sql.raw('"vendas_pecas"."id"')}
          AND conciliado = true
        ), 0)`,
        pixConciliadoValor: sql<number>`COALESCE((
          SELECT SUM(valor::numeric)
          FROM pix_recebimentos_mcp
          WHERE peca_venda_id = ${sql.raw('"vendas_pecas"."id"')}
        ), 0)`,
      })
      .from(vendasPecas)
      .where(and(eq(vendasPecas.lojaId, lojaId), gte(vendasPecas.dataVenda, desde))),
  ])

  const semNotaFiscal = vendasRows.filter(v => !v.notaFiscalSaida).length

  const vendasPendentes = vendasRows.filter(v => {
    const status = calcStatusMultiPagamento(v.pagamentos, v.conciliadoValor, v.pixConciliadoValor, v.valor)
    return status === 'pendente' || status === 'parcial'
  }).length

  const osPendentes = osRows.filter(o => {
    if (o.valorTotal == null) return false
    const pagamentos = pagamentosEfetivosOS(o.formaPagamento, o.pagamentos, o.valorTotal)
    const status = calcStatusMultiPagamento(pagamentos, o.conciliadoValor, o.pixConciliadoValor, o.valorTotal)
    return status === 'pendente' || status === 'parcial'
  }).length

  const pecasPendentes = pecasRows.filter(p => {
    const status = calcStatusMultiPagamento(p.pagamentos, p.conciliadoValor, p.pixConciliadoValor, p.valorTotal)
    return status === 'pendente' || status === 'parcial'
  }).length

  return { semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }
}
