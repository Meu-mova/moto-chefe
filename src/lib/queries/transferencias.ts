import { db } from '@/lib/db'
import { transferencias, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, or, and, ilike, inArray, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

export type TransferenciaComDetalhes = Awaited<ReturnType<typeof listarTransferencias>>[0]

export async function listarTransferencias(filtros?: {
  lojaId?: string        // non-admin: scope a loja origem OU destino do usuário
  lojaOrigemId?: string[]
  lojaDestinoId?: string[]
  modeloId?: string[]
  status?: string[]
  chassiBusca?: string
}) {
  const lojaOrigem  = alias(lojas,    'loja_origem')
  const lojaDestino = alias(lojas,    'loja_destino')
  const solicitante = alias(usuarios, 'solicitante')
  const respondente = alias(usuarios, 'respondente')

  return db
    .select({
      id:                 transferencias.id,
      status:             transferencias.status,
      dataSolicitacao:    transferencias.dataSolicitacao,
      dataResposta:       transferencias.dataResposta,
      observacao:         transferencias.observacao,
      motoId:             transferencias.motoId,
      chassi:             motos.chassi,
      motoStatus:         motos.status,
      cor:                motos.cor,
      modelo:             modelos.modelo,
      modeloId:           motos.modeloId,
      lojaOrigemId:       transferencias.lojaOrigemId,
      lojaOrigemNome:     lojaOrigem.nome,
      lojaDestinoId:      transferencias.lojaDestinoId,
      lojaDestinoNome:    lojaDestino.nome,
      solicitadoPorNome:  solicitante.nome,
      respondidoPorNome:  respondente.nome,
    })
    .from(transferencias)
    .innerJoin(motos,        eq(transferencias.motoId,         motos.id))
    .innerJoin(modelos,      eq(motos.modeloId,                modelos.id))
    .innerJoin(lojaOrigem,   eq(transferencias.lojaOrigemId,   lojaOrigem.id))
    .innerJoin(lojaDestino,  eq(transferencias.lojaDestinoId,  lojaDestino.id))
    .innerJoin(solicitante,  eq(transferencias.solicitadoPor,  solicitante.id))
    .leftJoin(respondente,   eq(transferencias.respondidoPor,  respondente.id))
    .where(
      and(
        filtros?.lojaId
          ? or(eq(transferencias.lojaOrigemId, filtros.lojaId), eq(transferencias.lojaDestinoId, filtros.lojaId))
          : undefined,
        filtros?.lojaOrigemId !== undefined   ? inArray(transferencias.lojaOrigemId,  filtros.lojaOrigemId)              : undefined,
        filtros?.lojaDestinoId !== undefined  ? inArray(transferencias.lojaDestinoId, filtros.lojaDestinoId)             : undefined,
        filtros?.modeloId?.length       ? inArray(motos.modeloId,               filtros.modeloId)                  : undefined,
        filtros?.status?.length         ? inArray(transferencias.status,         filtros.status as any[])           : undefined,
        filtros?.chassiBusca?.trim()    ? ilike(motos.chassi,                   `%${filtros.chassiBusca.trim()}%`) : undefined,
      )
    )
    .orderBy(desc(transferencias.dataSolicitacao))
}

// Mantidas para compatibilidade com código legado
export async function listarTransferenciasPorLoja(lojaId: string) {
  return listarTransferencias({ lojaId })
}

export async function listarTodasTransferencias() {
  return listarTransferencias()
}
