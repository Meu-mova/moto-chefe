import { db } from '@/lib/db'
import { garantias, motos, lojas, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type GarantiaComDetalhes = Awaited<ReturnType<typeof listarGarantiasPorLoja>>[0]

export async function listarGarantiasPorLoja(lojaId: string) {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      motoId: garantias.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      osId: garantias.osId,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .where(eq(garantias.lojaId, lojaId))
    .orderBy(garantias.dataInicio)
}

export async function listarTodasGarantias() {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      motoId: garantias.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      osId: garantias.osId,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .orderBy(garantias.dataInicio)
}

export async function listarGarantiasPorMoto(motoId: string) {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      osId: garantias.osId,
    })
    .from(garantias)
    .where(eq(garantias.motoId, motoId))
    .orderBy(garantias.dataInicio)
}
