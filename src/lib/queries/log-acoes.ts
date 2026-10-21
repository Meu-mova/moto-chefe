import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, logAcoes, usuarios } from '@/lib/db/schema'
import type { EventoLog } from '@/lib/log-acoes-tela'

type Executor = Pick<typeof db, 'select'>

// Teto de linhas por consulta: o período padrão (14 dias) fica bem abaixo disso.
export const LIMITE_LOG = 5000

/** contaId 'todas' só chega aqui para o admin_geral (contaDoFiltro). */
export async function listarLog(
  filtro: { contaId: string; de: string; ate: string },
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
    ))
    .orderBy(desc(logAcoes.criadoEm))
    .limit(LIMITE_LOG)
  return linhas.map(l => ({ ...l, detalhe: l.detalhe ?? null }))
}
