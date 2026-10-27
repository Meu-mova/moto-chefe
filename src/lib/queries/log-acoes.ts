import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, logAcoes, usuarios } from '@/lib/db/schema'
import type { EventoLog } from '@/lib/log-acoes-tela'

type Executor = Pick<typeof db, 'select' | 'selectDistinct'>

// Teto de linhas por consulta: o período padrão (14 dias) fica bem abaixo disso.
export const LIMITE_LOG = 5000

/** contaId 'todas' só chega aqui para o admin_geral (contaDoFiltro). */
export async function listarLog(
  filtro: { contaId: string; de: string; ate: string; usuarioId?: string },
  executor: Executor = db,
): Promise<EventoLog[]> {
  const linhas = await executor.select({
    id: logAcoes.id,
    tipo: logAcoes.tipo,
    usuarioId: logAcoes.usuarioId,
    usuarioNome: usuarios.nome,
    contaDoUsuario: usuarios.contaId,
    contaId: logAcoes.contaId,
    grupoNome: grupos.nome,
    ip: logAcoes.ip,
    userAgent: logAcoes.userAgent,
    dia: logAcoes.dia,
    criadoEm: logAcoes.criadoEm,
    detalhe: logAcoes.detalhe,
  })
    .from(logAcoes)
    .leftJoin(usuarios, eq(usuarios.id, logAcoes.usuarioId))
    .leftJoin(grupos, eq(grupos.id, logAcoes.grupoId))
    .where(and(
      filtro.contaId === 'todas' ? sql`true` : eq(logAcoes.contaId, filtro.contaId),
      gte(logAcoes.dia, filtro.de),
      lte(logAcoes.dia, filtro.ate),
      filtro.usuarioId ? eq(logAcoes.usuarioId, filtro.usuarioId) : undefined,
    ))
    .orderBy(desc(logAcoes.criadoEm))
    .limit(LIMITE_LOG)
  return linhas.map(l => ({ ...l, detalhe: l.detalhe ?? null }))
}

/** Opções do filtro de pessoa: quem tem registro na Conta e no período, sem o teto de linhas. */
export async function listarPessoasDoLog(
  filtro: { contaId: string; de: string; ate: string },
  executor: Executor = db,
): Promise<{ usuarioId: string; nome: string }[]> {
  const linhas = await executor.selectDistinct({ usuarioId: logAcoes.usuarioId, nome: usuarios.nome })
    .from(logAcoes)
    .leftJoin(usuarios, eq(usuarios.id, logAcoes.usuarioId))
    .where(and(
      filtro.contaId === 'todas' ? sql`true` : eq(logAcoes.contaId, filtro.contaId),
      gte(logAcoes.dia, filtro.de),
      lte(logAcoes.dia, filtro.ate),
    ))
  // Dois excluídos teriam o mesmo nome no filtro: o começo do id os separa.
  return linhas
    .map(l => ({ usuarioId: l.usuarioId, nome: l.nome ?? `Usuário excluído (${l.usuarioId.slice(0, 8)})` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
