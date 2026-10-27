import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pedidosVenda } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Pedido de venda que o usuário pode ver, ou null. A Conta entra no where; o grupo da
 * loja do pedido vem depois, no podeAbrirRegistroDaLoja. Pedido de outra Conta volta
 * null, igual a pedido inexistente: quem chama responde "Pedido não encontrado" nos
 * dois casos, para a frase não revelar que ele existe em outra Conta (#404).
 */
export async function pedidoDoUsuario(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  pedidoId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(pedidosVenda.lojaId, lojasDaConta(usuario.contaId)) : null
  if (daConta === null) return null
  const [pedido] = await exec
    .select({ lojaId: pedidosVenda.lojaId, status: pedidosVenda.status })
    .from(pedidosVenda)
    .where(and(eq(pedidosVenda.id, pedidoId), daConta))
    .limit(1)
  if (!pedido || !(await podeAbrirRegistroDaLoja(usuario, pedido.lojaId, exec))) return null
  return pedido
}
