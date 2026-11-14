import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { motoNaoArquivada } from '@/lib/queries/showroom'
import { transferencias, motos, lojas, usuarios, modelos, grupos } from '@/lib/db/schema'
import { eq, or, and, ilike, inArray, desc } from 'drizzle-orm'
import { alias, type PgSelect } from 'drizzle-orm/pg-core'

export type TransferenciaComDetalhes = Awaited<ReturnType<typeof listarTransferencias>>[0]

type Executor = Pick<typeof db, 'select'>

const lojaOrigem  = alias(lojas,    'loja_origem')
const lojaDestino = alias(lojas,    'loja_destino')
const solicitante = alias(usuarios, 'solicitante')
const respondente = alias(usuarios, 'respondente')

// Mesmas colunas na lista e no comprovante: o que o card mostra, o papel repete.
const colunasDaTransferencia = {
  id:                 transferencias.id,
  status:             transferencias.status,
  dataSolicitacao:    transferencias.dataSolicitacao,
  dataResposta:       transferencias.dataResposta,
  observacao:         transferencias.observacao,
  motoId:             transferencias.motoId,
  chassi:             motos.chassi,
  motoStatus:         motos.status,
  cor:                motos.cor,
  modelo:             nomeDoModeloNaLoja(transferencias.lojaOrigemId),
  modeloId:           motos.modeloId,
  lojaOrigemId:       transferencias.lojaOrigemId,
  lojaOrigemNome:     lojaOrigem.nome,
  lojaDestinoId:      transferencias.lojaDestinoId,
  lojaDestinoNome:    lojaDestino.nome,
  solicitadoPorNome:  solicitante.nome,
  respondidoPorNome:  respondente.nome,
}

function comDetalhes<T extends PgSelect>(q: T) {
  return q
    .innerJoin(motos,        eq(transferencias.motoId,         motos.id))
    .innerJoin(modelos,      eq(motos.modeloId,                modelos.id))
    .innerJoin(lojaOrigem,   eq(transferencias.lojaOrigemId,   lojaOrigem.id))
    .innerJoin(lojaDestino,  eq(transferencias.lojaDestinoId,  lojaDestino.id))
    .innerJoin(solicitante,  eq(transferencias.solicitadoPor,  solicitante.id))
    .leftJoin(respondente,   eq(transferencias.respondidoPor,  respondente.id))
}

export async function listarTransferencias(filtros?: {
  lojaId?: string        // non-admin: scope a loja origem OU destino do usuário
  lojaOrigemId?: string[]
  lojaDestinoId?: string[]
  // admin: escopo padrão (sem filtro explícito de origem/destino) — usa OR, não AND,
  // para não esconder transferências entre grupos (que têm só uma ponta no grupo ativo)
  lojaOrigemOuDestinoId?: string[]
  modeloId?: string[]
  status?: string[]
  chassiBusca?: string
}) {
  return comDetalhes(db.select(colunasDaTransferencia).from(transferencias).$dynamic())
    .where(
      and(
        filtros?.lojaId
          ? or(eq(transferencias.lojaOrigemId, filtros.lojaId), eq(transferencias.lojaDestinoId, filtros.lojaId))
          : undefined,
        filtros?.lojaOrigemId !== undefined   ? inArray(transferencias.lojaOrigemId,  filtros.lojaOrigemId)              : undefined,
        filtros?.lojaDestinoId !== undefined  ? inArray(transferencias.lojaDestinoId, filtros.lojaDestinoId)             : undefined,
        filtros?.lojaOrigemOuDestinoId?.length
          ? or(
              inArray(transferencias.lojaOrigemId,  filtros.lojaOrigemOuDestinoId),
              inArray(transferencias.lojaDestinoId, filtros.lojaOrigemOuDestinoId),
            )
          : undefined,
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

const STATUS_TRANSFERIVEIS = ['caixa', 'faturada', 'montada', 'disponivel', 'reservada', 'em_garantia'] as const

// Só das lojas pedidas, dentro da consulta: a lista vai inteira para o navegador.
export async function listarMotosTransferiveis(lojaIds: string[], exec: Executor = db) {
  if (!lojaIds.length) return []
  return exec
    .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: nomeDoModeloNaLoja(motos.lojaId), lojaId: motos.lojaId })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(and(inArray(motos.status, [...STATUS_TRANSFERIVEIS]), inArray(motos.lojaId, lojaIds), motoNaoArquivada()))
}

const grupoDaOrigem = alias(grupos, 'grupo_origem')

/**
 * Uma transferência para o comprovante (#877), só se a origem ou o destino for uma das
 * `lojaIds` (as do grupo ativo, como na lista). Fora delas ou inexistente: `null`, igual.
 * A empresa do cabeçalho é a do grupo da loja de origem.
 */
export async function buscarTransferenciaDoGrupo(id: string, lojaIds: string[], exec: Executor = db) {
  if (!lojaIds.length) return null
  const [linha] = await comDetalhes(
    exec.select({
      ...colunasDaTransferencia,
      motor:              motos.motor,
      empresaNome:        grupoDaOrigem.nome,
      empresaRazaoSocial: grupoDaOrigem.razaoSocial,
      empresaCnpj:        grupoDaOrigem.cnpj,
    }).from(transferencias).$dynamic(),
  )
    .innerJoin(grupoDaOrigem, eq(lojaOrigem.grupoId, grupoDaOrigem.id))
    .where(and(
      eq(transferencias.id, id),
      or(inArray(transferencias.lojaOrigemId, lojaIds), inArray(transferencias.lojaDestinoId, lojaIds)),
    ))
    .limit(1)
  return linha ?? null
}
