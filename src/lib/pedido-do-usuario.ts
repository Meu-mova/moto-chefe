import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pedidosVenda, pedidosVendaItens } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { lojasDoEscopo } from '@/lib/conta'

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
    : usuario.contaId ? inArray(pedidosVenda.lojaId, lojasDoEscopo(usuario)) : null
  if (daConta === null) return null
  const [pedido] = await exec
    .select({ lojaId: pedidosVenda.lojaId, status: pedidosVenda.status, motoId: pedidosVenda.motoId, numero: pedidosVenda.numero, entrega: pedidosVenda.entrega })
    .from(pedidosVenda)
    .where(and(eq(pedidosVenda.id, pedidoId), daConta))
    .limit(1)
  if (!pedido || !(await podeAbrirRegistroDaLoja(usuario, pedido.lojaId, exec))) return null
  return pedido
}

/**
 * Itens do pedido (#774), ou null quando o pedido não é visível para o usuário: a Conta é a
 * do pedido, conferida no pedidoDoUsuario, então outra Conta e id inexistente dão o mesmo null.
 */
export async function itensDoPedido(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  pedidoId: string,
  exec: Executor = db,
) {
  if (!(await pedidoDoUsuario(usuario, pedidoId, exec))) return null
  return exec
    .select({
      tipo: pedidosVendaItens.tipo,
      motoId: pedidosVendaItens.motoId,
      pecaId: pedidosVendaItens.pecaId,
      quantidade: pedidosVendaItens.quantidade,
      valorUnitario: pedidosVendaItens.valorUnitario,
    })
    .from(pedidosVendaItens)
    .where(eq(pedidosVendaItens.pedidoVendaId, pedidoId))
    .orderBy(asc(pedidosVendaItens.criadoEm), asc(pedidosVendaItens.id))
}
