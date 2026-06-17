import { db } from '@/lib/db'
import { garantias, motos, lojas, modelos } from '@/lib/db/schema'
import { eq, and, ilike, desc } from 'drizzle-orm'

const CAMPOS_SELECT = {
  id: garantias.id,
  status: garantias.status,
  descricao: garantias.descricao,
  dataInicio: garantias.dataInicio,
  dataFim: garantias.dataFim,
  dataEncerramento: garantias.dataEncerramento,
  dataPedidoPeca: garantias.dataPedidoPeca,
  numeroPedidoFabrica: garantias.numeroPedidoFabrica,
  lojaId: garantias.lojaId,
  motoId: garantias.motoId,
  chassi: motos.chassi,
  cor: motos.cor,
  marca: modelos.marca,
  modelo: modelos.modelo,
  modeloId: motos.modeloId,
  lojaNome: lojas.nome,
  osId: garantias.osId,
}

export type GarantiaComDetalhes = Awaited<ReturnType<typeof listarGarantias>>[0]

export async function listarGarantias(filtros?: {
  lojaId?: string
  status?: string
  chassiBusca?: string
  numeroPedidoFabrica?: string
  modeloId?: string
}) {
  return db
    .select(CAMPOS_SELECT)
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .where(and(
      filtros?.lojaId             ? eq(garantias.lojaId, filtros.lojaId)                                    : undefined,
      filtros?.status             ? eq(garantias.status, filtros.status as any)                             : undefined,
      filtros?.chassiBusca?.trim()
        ? ilike(motos.chassi, `%${filtros.chassiBusca.trim()}%`)                                            : undefined,
      filtros?.numeroPedidoFabrica?.trim()
        ? ilike(garantias.numeroPedidoFabrica, `%${filtros.numeroPedidoFabrica.trim()}%`)                   : undefined,
      filtros?.modeloId           ? eq(motos.modeloId, filtros.modeloId)                                    : undefined,
    ))
    .orderBy(desc(garantias.dataInicio))
}

// Compat wrappers usados em outros lugares
export async function listarGarantiasPorLoja(lojaId: string) {
  return listarGarantias({ lojaId })
}

export async function listarTodasGarantias() {
  return listarGarantias()
}

export async function listarGarantiasPorMoto(motoId: string) {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataEncerramento: garantias.dataEncerramento,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      osId: garantias.osId,
    })
    .from(garantias)
    .where(eq(garantias.motoId, motoId))
    .orderBy(desc(garantias.dataInicio))
}
