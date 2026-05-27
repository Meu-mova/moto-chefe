// src/lib/queries/motos.ts
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios, historicoEstoque } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export type MotoComDetalhes = Awaited<ReturnType<typeof listarMotos>>[0]

export async function listarMotos(filtros?: {
  status?: string
  lojaId?: string
  modeloId?: string
  categoria?: string
}) {
  return db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(
      and(
        filtros?.status ? eq(motos.status, filtros.status as any) : undefined,
        filtros?.lojaId ? eq(motos.lojaId, filtros.lojaId) : undefined,
        filtros?.modeloId ? eq(motos.modeloId, filtros.modeloId) : undefined,
        filtros?.categoria ? eq(modelos.categoria, filtros.categoria as any) : undefined,
      )
    )
    .orderBy(motos.status)
}

export async function contarPorStatus() {
  return db
    .select({
      status: motos.status,
      total: sql<number>`count(*)::int`,
    })
    .from(motos)
    .groupBy(motos.status)
}

export async function buscarMoto(id: string) {
  const [moto] = await db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      motor: modelos.motor,
      velocidadeMax: modelos.velocidadeMax,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(eq(motos.id, id))
    .limit(1)

  return moto ?? null
}

export async function buscarHistoricoMoto(motoId: string) {
  return db
    .select({
      id: historicoEstoque.id,
      tipo: historicoEstoque.tipo,
      statusAnterior: historicoEstoque.statusAnterior,
      statusNovo: historicoEstoque.statusNovo,
      data: historicoEstoque.data,
      observacao: historicoEstoque.observacao,
      usuarioNome: usuarios.nome,
    })
    .from(historicoEstoque)
    .leftJoin(usuarios, eq(historicoEstoque.usuarioId, usuarios.id))
    .where(eq(historicoEstoque.motoId, motoId))
    .orderBy(sql`${historicoEstoque.data} DESC`)
}
