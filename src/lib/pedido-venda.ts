import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { historicoEstoque, motos, pedidosVenda, reservas, transferencias } from '@/lib/db/schema'
import { motivoBloqueioCriarPedido, podeCancelarPedido, type QuemCancela } from '@/lib/pedido-venda-regras'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Cria um pedido de venda pendente e reserva a moto. Substitui a rpc
 * criar_pedido_venda, que exigia o status antigo 'disponivel' e recusava as motos
 * montadas que a tela oferece (#181).
 */
export async function criarPedidoTx(
  tx: Tx,
  d: { motoId: string; vendedorId: string; observacao: string | null },
): Promise<{ pedidoId: string; lojaId: string }> {
  const [moto] = await tx
    .select({ lojaId: motos.lojaId, status: motos.status, disponibilidade: motos.disponibilidade })
    .from(motos)
    .where(eq(motos.id, d.motoId))
    .for('update')
  if (!moto) throw new Error('Moto não encontrada')

  const [transferencia] = await tx
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(and(eq(transferencias.motoId, d.motoId), eq(transferencias.status, 'pendente')))
    .limit(1)
  const motivo = motivoBloqueioCriarPedido(moto, !!transferencia)
  if (motivo) throw new Error(motivo)

  await tx.update(motos).set({ disponibilidade: 'reservada' }).where(eq(motos.id, d.motoId))

  const [pedido] = await tx.insert(pedidosVenda).values({
    motoId: d.motoId,
    lojaId: moto.lojaId,
    vendedorId: d.vendedorId,
    status: 'pendente',
    observacao: d.observacao,
  }).returning({ id: pedidosVenda.id })

  await tx.insert(historicoEstoque).values({
    motoId: d.motoId,
    usuarioId: d.vendedorId,
    tipo: 'mudanca_status',
    referenciaTipo: 'pedido_venda',
    referenciaId: pedido.id,
    observacao: 'Pedido de venda criado — moto reservada',
  })

  return { pedidoId: pedido.id, lojaId: moto.lojaId }
}

/**
 * Cancela um pedido pendente e devolve a moto a 'disponivel'. Substitui a rpc
 * cancelar_pedido_venda, que gravava o status antigo e recusava o sócio (#181).
 */
export async function cancelarPedidoTx(
  tx: Tx,
  d: { pedidoId: string; usuario: QuemCancela; observacao: string | null },
): Promise<void> {
  const [pedido] = await tx
    .select({ motoId: pedidosVenda.motoId, lojaId: pedidosVenda.lojaId, vendedorId: pedidosVenda.vendedorId, status: pedidosVenda.status })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.id, d.pedidoId))
    .for('update')
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 'pendente') throw new Error(`Pedido não está pendente (status: ${pedido.status})`)
  if (!podeCancelarPedido(d.usuario, pedido)) throw new Error('Sem permissão para cancelar este pedido')

  // O motivo do cancelamento vai só para o histórico: a observação de quem criou o pedido fica.
  await tx.update(pedidosVenda)
    .set({ status: 'cancelado', dataAtualizacao: new Date() })
    .where(eq(pedidosVenda.id, d.pedidoId))

  const [moto] = await tx
    .select({ disponibilidade: motos.disponibilidade })
    .from(motos)
    .where(eq(motos.id, pedido.motoId))
    .for('update')
  const [reservaAtiva] = await tx
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.motoId, pedido.motoId), eq(reservas.status, 'ativa')))
    .limit(1)
  // Só libera a moto se ela ainda estiver reservada e sem reserva ativa: se mudou por
  // outro caminho (vendida, aguardando aprovação, reserva de verdade), não mexe nela.
  if (moto?.disponibilidade === 'reservada' && !reservaAtiva) {
    await tx.update(motos).set({ disponibilidade: 'disponivel' }).where(eq(motos.id, pedido.motoId))
  }

  await tx.insert(historicoEstoque).values({
    motoId: pedido.motoId,
    usuarioId: d.usuario.id,
    tipo: 'mudanca_status',
    referenciaTipo: 'pedido_venda',
    referenciaId: d.pedidoId,
    observacao: d.observacao ? `Pedido de venda cancelado — ${d.observacao}` : 'Pedido de venda cancelado',
  })
}
