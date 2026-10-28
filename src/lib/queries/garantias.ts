import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { garantias, motos, lojas, modelos } from '@/lib/db/schema'
import { eq, and, ilike, desc, gte, lte, isNull, isNotNull, inArray } from 'drizzle-orm'

const CAMPOS_SELECT = {
  id: garantias.id,
  status: garantias.status,
  descricao: garantias.descricao,
  dataInicio: garantias.dataInicio,
  dataFim: garantias.dataFim,
  dataEncerramento: garantias.dataEncerramento,
  dataPedidoPeca: garantias.dataPedidoPeca,
  numeroPedidoFabrica: garantias.numeroPedidoFabrica,
  statusFabrica: garantias.statusFabrica,
  statusFabricaSyncEm: garantias.statusFabricaSyncEm,
  lojaId: garantias.lojaId,
  motoId: garantias.motoId,
  chassi: motos.chassi,
  cor: motos.cor,
  marca: modelos.marca,
  modelo: nomeDoModeloNaLoja(garantias.lojaId),
  modeloId: motos.modeloId,
  lojaNome: lojas.nome,
  osId: garantias.osId,
}

export type GarantiaComDetalhes = Awaited<ReturnType<typeof listarGarantias>>[0]

// lojaIds é obrigatório: é o escopo de quem consulta (lojas do grupo ativo, ou a própria
// loja). Lista vazia não traz nada; nunca a base toda (#328).
export async function listarGarantias(filtros: {
  lojaIds: string[]
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
      inArray(garantias.lojaId, filtros.lojaIds),
      filtros?.status             ? eq(garantias.status, filtros.status as any)                             : undefined,
      filtros?.chassiBusca?.trim()
        ? ilike(motos.chassi, `%${filtros.chassiBusca.trim()}%`)                                            : undefined,
      filtros?.numeroPedidoFabrica?.trim()
        ? ilike(garantias.numeroPedidoFabrica, `%${filtros.numeroPedidoFabrica.trim()}%`)                   : undefined,
      filtros?.modeloId           ? eq(motos.modeloId, filtros.modeloId)                                    : undefined,
    ))
    .orderBy(desc(garantias.dataInicio))
}

export async function exportarRelatorioGarantias(filtros: {
  lojaIds: string[]
  status?: string
  modeloId?: string
  statusFabrica?: string
  semPedidoFabrica?: boolean
  dataInicio?: string
  dataFim?: string
}) {
  return db
    .select({
      id:                  garantias.id,
      status:              garantias.status,
      descricao:           garantias.descricao,
      dataInicio:          garantias.dataInicio,
      dataFim:             garantias.dataFim,
      dataEncerramento:    garantias.dataEncerramento,
      dataPedidoPeca:      garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      statusFabrica:       garantias.statusFabrica,
      chassi:              motos.chassi,
      cor:                 motos.cor,
      marca:               modelos.marca,
      modelo:              nomeDoModeloNaLoja(garantias.lojaId),
      lojaId:              garantias.lojaId,
      lojaNome:            lojas.nome,
    })
    .from(garantias)
    .innerJoin(motos,   eq(garantias.motoId,    motos.id))
    .innerJoin(modelos, eq(motos.modeloId,       modelos.id))
    .innerJoin(lojas,   eq(garantias.lojaId,     lojas.id))
    .where(and(
      inArray(garantias.lojaId, filtros.lojaIds),
      filtros.status      ? eq(garantias.status, filtros.status as any)                   : undefined,
      filtros.modeloId    ? eq(motos.modeloId, filtros.modeloId)                          : undefined,
      filtros.statusFabrica === '__sem'
        ? isNull(garantias.numeroPedidoFabrica)
        : filtros.statusFabrica
          ? ilike(garantias.statusFabrica, filtros.statusFabrica)
          : undefined,
      filtros.dataInicio  ? gte(garantias.dataInicio, filtros.dataInicio)                 : undefined,
      filtros.dataFim     ? lte(garantias.dataInicio, filtros.dataFim)                    : undefined,
    ))
    .orderBy(desc(garantias.dataInicio))
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
