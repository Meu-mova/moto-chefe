import { and, eq, inArray, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { historicoEstoque, motos, pecasCatalogo, pedidosVenda, pedidosVendaItens, reservas, transferencias } from '@/lib/db/schema'
import { motivoBloqueioCriarPedido, podeCancelarPedido, valorDaPecaNoPedido, type PecaDoPedidoInput, type QuemCancela } from '@/lib/pedido-venda-regras'
import { daContaDaLoja } from '@/lib/pecas-da-conta'
import { recusaDaQuantidadeVendida } from '@/lib/quantidade-vendida'
import { ehUuid } from '@/lib/uuid'
import { RecusaUsuario } from '@/lib/resultado-action'
import { travarMotoNaoArquivada } from '@/lib/moto-do-usuario'
import { pedidoEmAprovacaoSql } from '@/lib/pedido-de-aprovacao'
import type { EntregaVenda } from '@/lib/notagateway/entrega'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Brinde e acessório do pedido (#778) conferidos como na venda de peça: só peça do catálogo da Conta da loja
 * ("Peça não encontrada" também para id inexistente) e quantidade inteira. O estoque só baixa na efetivação.
 */
async function pecasConferidas(tx: Tx, lojaId: string, pecas: PecaDoPedidoInput[]) {
  if (pecas.length === 0) return []
  const recusa = recusaDaQuantidadeVendida(pecas)
  if (recusa) throw new RecusaUsuario(recusa)
  const valorInvalido = (v: number | undefined) => v != null && !(Number.isFinite(v) && v >= 0)
  if (pecas.some(p => !['brinde', 'acessorio'].includes(p.tipo) || p.quantidade <= 0 || valorInvalido(p.valorUnitario))) {
    throw new RecusaUsuario('Item do pedido inválido')
  }
  // Id que nem é uuid derrubaria a consulta com erro do banco; recebe a mesma frase de peça de outra Conta.
  if (!pecas.every(p => ehUuid(p.pecaId))) throw new RecusaUsuario('Peça não encontrada')
  const doCatalogo = await tx.select({ id: pecasCatalogo.id, valor: pecasCatalogo.valor }).from(pecasCatalogo)
    .where(and(inArray(pecasCatalogo.id, pecas.map(p => p.pecaId)), daContaDaLoja(lojaId)))
  const preco = new Map(doCatalogo.map(p => [p.id, p.valor]))
  return pecas.map(p => {
    const precoDoCatalogo = preco.get(p.pecaId)
    if (precoDoCatalogo === undefined) throw new RecusaUsuario('Peça não encontrada')
    return { tipo: p.tipo, pecaId: p.pecaId, quantidade: String(p.quantidade), valorUnitario: valorDaPecaNoPedido(p, precoDoCatalogo) }
  })
}

/**
 * Cria um pedido de venda pendente e reserva a moto. Substitui a rpc
 * criar_pedido_venda, que exigia o status antigo 'disponivel' e recusava as motos
 * montadas que a tela oferece (#181).
 *
 * Contrato: lê a moto só pelo id, sem Conta. Quem chama confere antes que a moto é da
 * pessoa (motoDoUsuario); só assim a recusa de moto arquivada (#688) não revela moto de
 * outra Conta. Aqui ela é conferida de novo sob a trava (travarMotoNaoArquivada).
 */
export async function criarPedidoTx(
  tx: Tx,
  d: { motoId: string; vendedorId: string; observacao: string | null; entrega: EntregaVenda; pecas?: PecaDoPedidoInput[] },
): Promise<{ pedidoId: string; lojaId: string }> {
  const moto = await travarMotoNaoArquivada(tx, d.motoId)
  const pecas = await pecasConferidas(tx, moto.lojaId, d.pecas ?? [])

  const [transferencia] = await tx
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(and(eq(transferencias.motoId, d.motoId), eq(transferencias.status, 'pendente')))
    .limit(1)
  const motivo = motivoBloqueioCriarPedido(moto, !!transferencia)
  if (motivo) throw new RecusaUsuario(motivo)

  await tx.update(motos).set({ disponibilidade: 'reservada' }).where(eq(motos.id, d.motoId))

  const [pedido] = await tx.insert(pedidosVenda).values({
    motoId: d.motoId,
    lojaId: moto.lojaId,
    vendedorId: d.vendedorId,
    status: 'pendente',
    observacao: d.observacao,
    entrega: d.entrega,
  }).returning({ id: pedidosVenda.id })
  // Sem valor: o Novo pedido ainda não pede o valor da moto (#783); a efetivação preenche.
  await gravarMotoDoPedido(tx, { pedidoId: pedido.id, motoId: d.motoId, valor: null })
  if (pecas.length > 0) await tx.insert(pedidosVendaItens).values(pecas.map(p => ({ ...p, pedidoVendaId: pedido.id })))

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
export const PEDIDO_AGUARDANDO_APROVACAO = 'Este pedido está aguardando aprovação. Aprove ou recuse antes de cancelar.'

export async function cancelarPedidoTx(
  tx: Tx,
  d: { pedidoId: string; usuario: QuemCancela; observacao: string | null },
): Promise<void> {
  const [pedido] = await tx
    .select({ motoId: pedidosVenda.motoId, lojaId: pedidosVenda.lojaId, vendedorId: pedidosVenda.vendedorId, status: pedidosVenda.status })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.id, d.pedidoId))
    .for('update')
  if (!pedido) throw new RecusaUsuario('Pedido não encontrado')
  if (pedido.status !== 'pendente') throw new RecusaUsuario('Este pedido não está mais pendente. Recarregue a página.')
  if (!podeCancelarPedido(d.usuario, pedido)) throw new RecusaUsuario('Sem permissão para cancelar este pedido')

  const [moto] = await tx
    .select({ disponibilidade: motos.disponibilidade })
    .from(motos)
    .where(eq(motos.id, pedido.motoId))
    .for('update')
  // Cancelar no meio deixaria a aprovação pendente sem pedido para efetivar (#776).
  const [{ emAprovacao }] = await tx.select({ emAprovacao: pedidoEmAprovacaoSql(d.pedidoId) }).from(pedidosVenda).where(eq(pedidosVenda.id, d.pedidoId))
  if (emAprovacao) throw new RecusaUsuario(PEDIDO_AGUARDANDO_APROVACAO)

  // O motivo do cancelamento vai só para o histórico: a observação de quem criou o pedido fica.
  await tx.update(pedidosVenda)
    .set({ status: 'cancelado', dataAtualizacao: new Date() })
    .where(eq(pedidosVenda.id, d.pedidoId))

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

/**
 * Grava a moto como item do pedido, com o valor (nulo = ainda não informado). Se o item já
 * existe, só troca o valor: assim a efetivação preenche o item do Novo pedido e o pedido de
 * antes dos itens (#774) ganha o seu. Quem chama já conferiu na Conta o pedido (ou a venda dele). O
 * conflito (pedido, moto) só casa linha deste pedido; o setWhere repete isso por extenso, como a
 * regra de upsert do AGENTS.md pede, mas não acrescenta trava.
 */
export async function gravarMotoDoPedido(
  tx: Tx,
  d: { pedidoId: string; motoId: string; valor: string | null },
): Promise<void> {
  await tx.insert(pedidosVendaItens)
    .values({ pedidoVendaId: d.pedidoId, tipo: 'moto', motoId: d.motoId, valorUnitario: d.valor })
    .onConflictDoUpdate({
      target: [pedidosVendaItens.pedidoVendaId, pedidosVendaItens.motoId],
      targetWhere: sql`moto_id is not null`,
      set: { valorUnitario: d.valor },
      setWhere: eq(pedidosVendaItens.pedidoVendaId, d.pedidoId),
    })
}
