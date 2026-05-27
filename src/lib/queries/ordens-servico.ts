import { db } from '@/lib/db'
import { ordensServico, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type OSComDetalhes = Awaited<ReturnType<typeof listarOSPorLoja>>[0]

export async function listarOSPorLoja(lojaId: string) {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      motoId: ordensServico.motoId,
      lojaId: ordensServico.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(motos, eq(ordensServico.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(ordensServico.lojaId, lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .where(eq(ordensServico.lojaId, lojaId))
    .orderBy(ordensServico.dataAbertura)
}

export async function listarTodasOS() {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      motoId: ordensServico.motoId,
      lojaId: ordensServico.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(motos, eq(ordensServico.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(ordensServico.lojaId, lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .orderBy(ordensServico.dataAbertura)
}

export async function listarOSPorMoto(motoId: string) {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .where(eq(ordensServico.motoId, motoId))
    .orderBy(ordensServico.dataAbertura)
}
