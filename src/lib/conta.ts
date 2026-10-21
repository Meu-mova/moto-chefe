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

// admin_geral (da plataforma, sem Conta) vê as lojas ativas de todas as Contas.
export async function listarLojasAtivasDaConta(
  usuario: { papel: string; contaId: string | null },
  exec: Executor = db,
): Promise<{ id: string; nome: string }[]> {
  const consulta = exec
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
  if (usuario.papel === 'admin_geral') return consulta.where(eq(lojas.ativa, true)).orderBy(asc(lojas.nome))
  if (!usuario.contaId) return []
  return consulta.where(and(eq(lojas.ativa, true), eq(grupos.contaId, usuario.contaId))).orderBy(asc(lojas.nome))
}

// Conta da loja de um registro (venda, OS): é a dona do cliente que ele cria ou atualiza.
export async function contaDaLoja(lojaId: string, exec: Executor = db): Promise<string> {
  const [r] = await exec
    .select({ contaId: grupos.contaId })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(eq(lojas.id, lojaId))
    .limit(1)
  if (!r) throw new Error('Loja não encontrada')
  return r.contaId
}
