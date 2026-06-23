import { db } from '@/lib/db'
import { pedidosVenda, vendas, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, and, ilike, inArray, desc, sql } from 'drizzle-orm'

export type PedidoComDetalhes = Awaited<ReturnType<typeof listarPedidosPorLoja>>[0]
export type VendaComDetalhes  = Awaited<ReturnType<typeof listarVendas>>[0]

export async function listarVendas(filtros?: {
  lojaId?: string[]
  modeloId?: string[]
  vendedorId?: string[]
  chassiBusca?: string
  notaFiscal?: string
}) {
  return db
    .select({
      id:               vendas.id,
      numero:           vendas.numero,
      motoId:           vendas.motoId,
      lojaId:           vendas.lojaId,
      vendedorId:       vendas.vendedorId,
      dataVenda:        vendas.dataVenda,
      valor:            vendas.valor,
      formaPagamento:   vendas.formaPagamento,
      pagamentos:       vendas.pagamentos,
      clienteNome:      vendas.clienteNome,
      clienteCpf:       vendas.clienteCpf,
      clienteCelular:   vendas.clienteCelular,
      clienteEmail:     vendas.clienteEmail,
      clienteCep:       vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero:    vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro:    vendas.clienteBairro,
      clienteCidade:    vendas.clienteCidade,
      clienteEstado:    vendas.clienteEstado,
      notaFiscalSaida:  vendas.notaFiscalSaida,
      conciliadoValor:  sql<number>`COALESCE((
        SELECT SUM(valor_bruto::numeric)
        FROM conciliacoes_cartao
        WHERE venda_id = ${vendas.id}
        AND conciliado = true
      ), 0)`,
      chassi:           motos.chassi,
      cor:              motos.cor,
      modeloId:         motos.modeloId,
      modelo:           modelos.modelo,
      marca:            modelos.marca,
      lojaNome:         lojas.nome,
      vendedorNome:     usuarios.nome,
    })
    .from(vendas)
    .innerJoin(motos,    eq(vendas.motoId,     motos.id))
    .innerJoin(modelos,  eq(motos.modeloId,    modelos.id))
    .innerJoin(lojas,    eq(vendas.lojaId,     lojas.id))
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .where(
      and(
        filtros?.lojaId?.length      ? inArray(vendas.lojaId,       filtros.lojaId)                         : undefined,
        filtros?.modeloId?.length    ? inArray(motos.modeloId,      filtros.modeloId)                       : undefined,
        filtros?.vendedorId?.length  ? inArray(vendas.vendedorId,   filtros.vendedorId)                     : undefined,
        filtros?.chassiBusca?.trim() ? ilike(motos.chassi,          `%${filtros.chassiBusca.trim()}%`)      : undefined,
        filtros?.notaFiscal?.trim()  ? ilike(vendas.notaFiscalSaida, `%${filtros.notaFiscal.trim()}%`)     : undefined,
      )
    )
    .orderBy(desc(vendas.dataVenda))
}

export async function listarPedidosPorLoja(lojaId: string) {
  return db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.lojaId, lojaId))
    .orderBy(pedidosVenda.dataPedido)
}

export async function listarTodosPedidos() {
  return db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .orderBy(pedidosVenda.dataPedido)
}

export async function buscarPedido(id: string) {
  const [pedido] = await db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      motoStatus: motos.status,
      motoLojaId: motos.lojaId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.id, id))
    .limit(1)
  return pedido ?? null
}
