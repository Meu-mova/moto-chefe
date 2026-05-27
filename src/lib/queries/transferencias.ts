import { db } from '@/lib/db'
import { transferencias, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'

export type TransferenciaComDetalhes = Awaited<ReturnType<typeof listarTransferenciasPorLoja>>[0]

export async function listarTransferenciasPorLoja(lojaId: string) {
  return db
    .select({
      id: transferencias.id,
      status: transferencias.status,
      dataSolicitacao: transferencias.dataSolicitacao,
      dataResposta: transferencias.dataResposta,
      observacao: transferencias.observacao,
      motoId: transferencias.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      motoStatus: motos.status,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaOrigemId: transferencias.lojaOrigemId,
      lojaOrigemNome: lojas.nome,
      lojaDestinoId: transferencias.lojaDestinoId,
      solicitadoPorId: transferencias.solicitadoPor,
      solicitadoPorNome: usuarios.nome,
    })
    .from(transferencias)
    .innerJoin(motos, eq(transferencias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(transferencias.lojaOrigemId, lojas.id))
    .innerJoin(usuarios, eq(transferencias.solicitadoPor, usuarios.id))
    .where(
      or(
        eq(transferencias.lojaOrigemId, lojaId),
        eq(transferencias.lojaDestinoId, lojaId)
      )
    )
    .orderBy(transferencias.dataSolicitacao)
}

export async function listarTodasTransferencias() {
  return db
    .select({
      id: transferencias.id,
      status: transferencias.status,
      dataSolicitacao: transferencias.dataSolicitacao,
      observacao: transferencias.observacao,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaOrigemNome: lojas.nome,
      lojaDestinoId: transferencias.lojaDestinoId,
      solicitadoPorNome: usuarios.nome,
    })
    .from(transferencias)
    .innerJoin(motos, eq(transferencias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(transferencias.lojaOrigemId, lojas.id))
    .innerJoin(usuarios, eq(transferencias.solicitadoPor, usuarios.id))
    .orderBy(transferencias.dataSolicitacao)
}
