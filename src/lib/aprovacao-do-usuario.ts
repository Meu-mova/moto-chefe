import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aprovacoesVenda } from '@/lib/db/schema'
import { lojasDoEscopo } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Pedido de aprovação da Conta do usuário, ou null. A Conta entra no where; quem pode
 * responder (papel e loja) quem chama confere depois. Pedido de outra Conta volta null,
 * igual a id inexistente: a resposta é "Solicitação não encontrada" nos dois casos, e
 * o status só aparece depois da permissão (#404).
 */
export async function aprovacaoDoUsuario(
  usuario: { papel: string; contaId: string | null; grupoLiberado?: string | null },
  aprovacaoId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(aprovacoesVenda.lojaId, lojasDoEscopo(usuario)) : null
  if (daConta === null) return null
  const [aprovacao] = await exec.select().from(aprovacoesVenda)
    .where(and(eq(aprovacoesVenda.id, aprovacaoId), daConta)).limit(1)
  return aprovacao ?? null
}
