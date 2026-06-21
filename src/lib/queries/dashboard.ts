import { db } from '@/lib/db'
import { vendas, motos, transferencias, garantias, ordensServico, lancamentosCaixa, lojas, modelos, pedidosVenda, usuarios } from '@/lib/db/schema'
import { eq, and, gte, lte, sql, count, sum, inArray, or } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

type Filtros = {
  dataInicio: string
  dataFim: string
  lojaId?: string[]
  vendedorId?: string
}

function lojaFilter(col: Column, ids: string[]) {
  return ids.length === 1 ? eq(col, ids[0]) : inArray(col, ids)
}

export async function getKPIs(filtros: Filtros) {
  const { dataInicio, dataFim, lojaId, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const vendasConditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
  if (lojaId?.length) vendasConditions.push(lojaFilter(vendas.lojaId, lojaId)!)
  if (vendedorId) vendasConditions.push(eq(vendas.vendedorId, vendedorId))

  const [vendasResult] = await db
    .select({
      totalVendas: count(),
      faturamento: sum(vendas.valor),
    })
    .from(vendas)
    .where(and(...vendasConditions))

  const estoqueConditions = [
    sql`${motos.status} != 'vendida'`,
    sql`${motos.disponibilidade} IS NULL OR ${motos.disponibilidade} != 'vendida'`,
  ]
  if (lojaId?.length) estoqueConditions.push(lojaFilter(motos.lojaId, lojaId)!)

  const [estoqueResult] = await db
    .select({ total: count() })
    .from(motos)
    .where(and(...estoqueConditions))

  const transfConditions = [
    eq(transferencias.status, 'pendente'),
  ]
  if (lojaId?.length) {
    transfConditions.push(
      or(
        lojaFilter(transferencias.lojaOrigemId, lojaId)!,
        lojaFilter(transferencias.lojaDestinoId, lojaId)!,
      )!
    )
  }

  const [transfResult] = await db
    .select({ total: count() })
    .from(transferencias)
    .where(and(...transfConditions))

  const garantiaConditions = [
    eq(garantias.status, 'ativa'),
  ]
  if (lojaId?.length) garantiaConditions.push(lojaFilter(garantias.lojaId, lojaId)!)

  const [garantiaResult] = await db
    .select({ total: count() })
    .from(garantias)
    .where(and(...garantiaConditions))

  const osConditions = [
    or(eq(ordensServico.status, 'aberta'), eq(ordensServico.status, 'em_andamento'))!,
  ]
  if (lojaId?.length) osConditions.push(lojaFilter(ordensServico.lojaId, lojaId)!)

  const [osResult] = await db
    .select({ total: count() })
    .from(ordensServico)
    .where(and(...osConditions))

  return {
    totalVendas: vendasResult.totalVendas,
    faturamento: Number(vendasResult.faturamento ?? 0),
    estoque: estoqueResult.total,
    transferenciasPendentes: transfResult.total,
    garantiasAtivas: garantiaResult.total,
    osAbertas: osResult.total,
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
  if (lojaId?.length) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
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
  if (lojaId?.length) conditions.push(lojaFilter(motos.lojaId, lojaId)!)

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
  const { dataInicio, dataFim, vendedorId } = filtros
  const inicio = new Date(dataInicio)
  const fim = new Date(dataFim + 'T23:59:59.999Z')

  const conditions = [
    gte(vendas.dataVenda, inicio),
    lte(vendas.dataVenda, fim),
  ]
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
  if (lojaId?.length) conditions.push(lojaFilter(vendas.lojaId, lojaId)!)
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
  if (lojaId?.length) {
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
  if (lojaId?.length) conditions.push(lojaFilter(garantias.lojaId, lojaId)!)

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
    or(eq(ordensServico.status, 'aberta'), eq(ordensServico.status, 'em_andamento'))!,
  ]
  if (lojaId?.length) conditions.push(lojaFilter(ordensServico.lojaId, lojaId)!)
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
