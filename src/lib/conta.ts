import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// Conta (ADR-0018): o que vale "entre grupos" (exceção nominal do Cesar, grupos de
// aprovação, lista de todas as lojas) vale só dentro da Conta do usuário.
// Sem next/headers, para ser testado contra o banco.

export async function grupoEstaNaConta(grupoId: string, contaId: string | null, exec: Executor = db): Promise<boolean> {
  if (!contaId) return false
  const [g] = await exec.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  return g?.contaId === contaId
}

export async function listarLojasAtivasDaConta(
  contaId: string | null,
  exec: Executor = db,
): Promise<{ id: string; nome: string }[]> {
  if (!contaId) return []
  return exec
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(and(eq(lojas.ativa, true), eq(grupos.contaId, contaId)))
    .orderBy(asc(lojas.nome))
}
