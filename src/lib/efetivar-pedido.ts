import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { clientes, historicoEstoque, lancamentosCaixa, motos, pedidosVenda, reservas, vendas } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { clientesDoEscopo, contaDaLoja } from '@/lib/conta'
import { RecusaUsuario } from '@/lib/resultado-action'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type DadosEfetivarPedido = {
  pedidoId: string
  /** Loja do pedido, já conferida pela action (permissão e origem são avaliadas nela). */
  lojaId: string
  efetivadoPor: string
  clienteId: string | null
  clienteNome: string
  clienteCpf: string
  valor: number
  formaPagamento: string
  origem: { origemId: string; origemDetalhe: string | null }
  /** Persona do admin_rede (#517): só cliente do grupo liberado. */
  grupoLiberado: string | null
}

/**
 * Efetiva um pedido de venda pendente: cria a venda, fecha o pedido, marca a moto
 * como vendida e converte a reserva ativa. Substitui a rpc efetivar_venda (0050),
 * que exige app.encryption_key (não existe em nenhum banco) e gravaria nome e CPF
 * cifrados, enquanto o resto do sistema lê texto puro (#181).
 */
export async function efetivarPedidoTx(tx: Tx, d: DadosEfetivarPedido): Promise<{ vendaId: string }> {
  const [pedido] = await tx
    .select({ motoId: pedidosVenda.motoId, lojaId: pedidosVenda.lojaId, vendedorId: pedidosVenda.vendedorId, status: pedidosVenda.status })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.id, d.pedidoId))
    .for('update')
  if (!pedido) throw new RecusaUsuario('Pedido não encontrado')
  if (pedido.status !== 'pendente') {
    throw new RecusaUsuario('Este pedido não está mais pendente. Recarregue a página.')
  }

  const [moto] = await tx
    .select({ status: motos.status })
    .from(motos)
    .where(eq(motos.id, pedido.motoId))
    .for('update')
  if (!moto) throw new RecusaUsuario('Moto não encontrada')
  if (moto.status === 'vendida') throw new RecusaUsuario('Moto já foi vendida')

  if (d.clienteId) {
    // Cliente de outra Conta não existe para esta venda (ADR-0018); na persona, nem o de
    // outro grupo da Conta dona (ADR-0019).
    const contaId = await contaDaLoja(pedido.lojaId, tx)
    const [cliente] = await tx.select({ id: clientes.id }).from(clientes)
      .where(and(eq(clientes.id, d.clienteId), clientesDoEscopo(contaId, { contaId, grupoLiberado: d.grupoLiberado }))).limit(1)
    if (!cliente) throw new RecusaUsuario('Cliente não encontrado')
  }

  const [reservaAtiva] = await tx
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.motoId, pedido.motoId), eq(reservas.status, 'ativa')))
    .limit(1)

  const agora = new Date()
  const valor = d.valor.toFixed(2)
  const [venda] = await tx.insert(vendas).values({
    pedidoVendaId: d.pedidoId,
    motoId: pedido.motoId,
    lojaId: d.lojaId,
    vendedorId: pedido.vendedorId,
    efetivadoPor: d.efetivadoPor,
    clienteId: d.clienteId,
    clienteNome: d.clienteNome,
    clienteCpf: d.clienteCpf,
    valor,
    formaPagamento: d.formaPagamento,
    pagamentos: [{ tipo: d.formaPagamento, valor: d.valor }],
    reservaId: reservaAtiva?.id ?? null,
    dataVenda: agora,
    origemId: d.origem.origemId,
    origemDetalhe: d.origem.origemDetalhe,
  }).returning({ id: vendas.id })

  if (reservaAtiva) {
    await tx.update(reservas).set({ status: 'convertida' }).where(eq(reservas.id, reservaAtiva.id))
  }

  await tx.update(pedidosVenda)
    .set({ status: 'efetivado', dataAtualizacao: agora })
    .where(eq(pedidosVenda.id, d.pedidoId))

  await tx.update(motos)
    .set({ status: 'vendida' as any, disponibilidade: null })
    .where(eq(motos.id, pedido.motoId))

  await tx.insert(historicoEstoque).values({
    motoId: pedido.motoId,
    lojaOrigemId: d.lojaId,
    usuarioId: d.efetivadoPor,
    tipo: 'saida',
    referenciaTipo: 'pedido_venda',
    referenciaId: d.pedidoId,
    observacao: `Venda (pedido efetivado) — Cliente: ${d.clienteNome} — Total: R$ ${valor}`,
  })

  if (d.formaPagamento === 'dinheiro') {
    await tx.insert(lancamentosCaixa).values({
      lojaId: d.lojaId,
      usuarioId: d.efetivadoPor,
      tipo: 'entrada',
      categoria: 'Venda',
      descricao: `Venda dinheiro — ${d.clienteNome}`,
      valor,
      data: hojeBrt(),
      vendaId: venda.id,
    })
  }

  return { vendaId: venda.id }
}
