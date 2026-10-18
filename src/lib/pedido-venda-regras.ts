// Regras puras do pedido de venda, sem banco: usadas pela action (servidor) e pelo
// cartão do pedido (cliente), para a tela e o servidor não divergirem de novo (#181:
// a tela mostrava "Cancelar" ao sócio e o banco recusava).

export type QuemCancela = { id: string; papel: string; lojaId: string | null }
export type PedidoParaCancelar = { status: string; lojaId: string; vendedorId: string }

export function podeCancelarPedido(usuario: QuemCancela, pedido: PedidoParaCancelar): boolean {
  if (pedido.status !== 'pendente') return false
  if (usuario.papel === 'admin_geral' || usuario.papel === 'admin_socio') return true
  if (usuario.papel === 'aux_adm') return usuario.lojaId === pedido.lojaId
  if (usuario.papel === 'vendedor') return usuario.id === pedido.vendedorId && usuario.lojaId === pedido.lojaId
  return false
}

export type MotoParaPedido = { status: string; disponibilidade: string | null }

/** Motivo para não criar pedido com esta moto, ou null quando pode. */
export function motivoBloqueioCriarPedido(moto: MotoParaPedido, temTransferenciaPendente: boolean): string | null {
  if (moto.status === 'caixa') return 'Moto ainda não foi montada — não pode ser vendida'
  if (moto.status === 'vendida') return 'Moto já foi vendida'
  if (moto.disponibilidade !== 'disponivel') {
    return `Moto não está disponível (${moto.disponibilidade ?? 'sem disponibilidade'})`
  }
  if (temTransferenciaPendente) return 'Moto tem transferência pendente'
  return null
}
