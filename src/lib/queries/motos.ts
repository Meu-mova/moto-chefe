// src/lib/queries/motos.ts
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios, historicoEstoque, transferencias } from '@/lib/db/schema'
import { eq, and, or, isNull, ilike, sql, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

export type MotoComDetalhes = Awaited<ReturnType<typeof listarMotos>>[0]

type OrdenacaoCampo = 'modelo' | 'cor' | 'loja' | 'status' | 'disponibilidade'

export async function listarMotos(filtros?: {
  status?: string[]
  disponibilidade?: string[]
  excluirVendidas?: boolean   // true = modo padrão: mostra null + disponivel + reservada, oculta vendida
  chassiBusca?: string
  lojaId?: string[]
  modeloId?: string[]
  cor?: string[]
  ord?: OrdenacaoCampo
  dir?: 'asc' | 'desc'
}) {
  const { asc, desc } = await import('drizzle-orm')
  const campoMap = {
    modelo:         modelos.modelo,
    cor:            motos.cor,
    loja:           lojas.nome,
    status:         motos.status,
    disponibilidade: motos.disponibilidade,
  } as const

  const campo = campoMap[filtros?.ord ?? 'modelo']
  const ordenar = filtros?.dir === 'desc' ? desc(campo) : asc(campo)

  return db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      disponibilidade: motos.disponibilidade,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      modeloId: motos.modeloId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      transferenciaPendente: sql<boolean>`EXISTS (
        SELECT 1 FROM transferencias
        WHERE transferencias.moto_id = ${motos.id}
        AND transferencias.status = 'pendente'
      )`,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(
      and(
        filtros?.status?.length          ? inArray(motos.status, filtros.status as any[])                   : undefined,
        filtros?.excluirVendidas
          ? sql`(${motos.disponibilidade} IS DISTINCT FROM 'vendida'::disponibilidade_moto)`
          : undefined,
        filtros?.disponibilidade?.length
          ? inArray(motos.disponibilidade, filtros.disponibilidade as any[])
          : undefined,
        filtros?.chassiBusca?.trim()
          ? ilike(motos.chassi, `%${filtros.chassiBusca.trim()}%`)
          : undefined,
        filtros?.lojaId?.length          ? inArray(motos.lojaId, filtros.lojaId)                            : undefined,
        filtros?.modeloId?.length        ? inArray(motos.modeloId, filtros.modeloId)                        : undefined,
        filtros?.cor?.length             ? inArray(motos.cor, filtros.cor)                                  : undefined,
      )
    )
    .orderBy(ordenar)
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
  const mecanico = alias(usuarios, 'mecanico')

  const [moto] = await db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      disponibilidade: motos.disponibilidade,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      motor: modelos.motor,
      mecanicoNome: mecanico.nome,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .leftJoin(mecanico, eq(motos.responsavelMontagemId, mecanico.id))
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
