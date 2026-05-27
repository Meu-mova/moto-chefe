import { db } from '@/lib/db'
import { pedidosVenda, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type PedidoComDetalhes = Awaited<ReturnType<typeof listarPedidosPorLoja>>[0]

export async function listarPedidosPorLoja(lojaId: string) {
  return db
    .select({
      id: pedidosVenda.id,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
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
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
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
