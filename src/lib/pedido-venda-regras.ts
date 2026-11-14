import { centavos } from '@/lib/numero-br'

// Regras puras do pedido de venda, sem banco: usadas pela action (servidor) e pelo
// cartão do pedido (cliente), para a tela e o servidor não divergirem de novo (#181:
// a tela mostrava "Cancelar" ao sócio e o banco recusava).

const PAPEIS_QUE_CRIAM_PEDIDO = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

/** Quem pode abrir pedido de venda (tela e servidor usam a mesma regra). */
export function podeCriarPedido(papel: string): boolean {
  return PAPEIS_QUE_CRIAM_PEDIDO.includes(papel)
}

export type QuemCancela = { id: string; papel: string; lojaId: string | null }
export type PedidoParaCancelar = { status: string; lojaId: string; vendedorId: string }

export function podeCancelarPedido(usuario: QuemCancela, pedido: PedidoParaCancelar): boolean {
  if (pedido.status !== 'pendente') return false
  if (usuario.papel === 'admin_geral' || usuario.papel === 'admin_socio') return true
  if (usuario.papel === 'aux_adm') return usuario.lojaId === pedido.lojaId
  if (usuario.papel === 'vendedor') return usuario.id === pedido.vendedorId && usuario.lojaId === pedido.lojaId
  return false
}

/** Tipos de item do pedido de venda (#770). O check da migração 0178 repete esta lista. */
export const TIPOS_ITEM_PEDIDO = ['moto', 'brinde', 'acessorio', 'frete'] as const
export type TipoItemPedido = (typeof TIPOS_ITEM_PEDIDO)[number]

export type MotoParaPedido = { status: string; disponibilidade: string | null }

/** Motivo para não criar pedido com esta moto, ou null quando pode. */
export function motivoBloqueioCriarPedido(moto: MotoParaPedido, temTransferenciaPendente: boolean): string | null {
  if (moto.status === 'caixa') return 'Moto ainda não foi montada. Não pode ser vendida.'
  if (moto.status === 'vendida') return 'Moto já foi vendida'
  if (moto.disponibilidade !== 'disponivel') {
    return `Moto não está disponível (${moto.disponibilidade ?? 'sem disponibilidade'})`
  }
  if (temTransferenciaPendente) return 'Moto tem transferência pendente'
  return null
}

/** Peça que entra no pedido (#778): brinde (R$ 0) ou acessório, do catálogo de peças da Conta. */
export type PecaDoPedidoInput = { tipo: 'brinde' | 'acessorio'; pecaId: string; quantidade: number; valorUnitario?: number }

/** Valor unitário gravado no item: brinde sempre R$ 0; acessório com o valor ajustado (já saneado) ou o do catálogo. */
export function valorDaPecaNoPedido(p: PecaDoPedidoInput, precoDoCatalogo: string): string {
  if (p.tipo === 'brinde') return '0.00'
  return p.valorUnitario != null && p.valorUnitario >= 0 ? p.valorUnitario.toFixed(2) : Number(precoDoCatalogo).toFixed(2)
}

/** Soma dos acessórios do pedido (o brinde vale R$ 0): entra no total que os pagamentos fecham. */
export function totalDasPecas(itens: readonly { quantidade: number | string; valorUnitario: number | string | null }[]): number {
  return centavos(itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valorUnitario ?? 0), 0))
}
