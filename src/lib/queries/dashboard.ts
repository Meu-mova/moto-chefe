import { db } from '@/lib/db'
import { vendas, motos, transferencias, garantias, ordensServico, lancamentosCaixa, lojas, modelos, pedidosVenda, usuarios, conciliacoesCartao } from '@/lib/db/schema'
import { eq, and, gte, lte, sql, count, sum, inArray, or, avg, desc, SQL } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

type Filtros = {
  dataInicio: string
  dataFim: string
  lojaId?: string[]
  vendedorId?: string
}

// Valor líquido por venda: usa valor_liquido da conciliação se existir, senão valor bruto da venda
function valorLiquidoExpr() {
  return sql`COALESCE(
    (SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
     FROM ${conciliacoesCartao}
     WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
       AND ${conciliacoesCartao.conciliado} = true),
    ${vendas.valor}::numeric
  )`
}

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
  const rows = await db.execute(sql`
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

export async function getVendasPorDia(filtros: Filtros) {
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
      valor: sum(vendas.valor),
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

export async function getVendasPorLoja(filtros: Filtros) {
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
      loja: lojas.nome,
      total: count(),
      valor: sum(vendas.valor),
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
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
      valor: vendas.valor,
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
      faturamento: sum(vendas.valor),
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
      faturamento: sum(vendas.valor),
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(and(...conditions))
    .groupBy(vendas.lojaId, lojas.nome)
    .orderBy(desc(sum(vendas.valor)))
}
