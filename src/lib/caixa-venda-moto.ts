/**
 * Dinheiro da venda de moto entra no caixa da loja: uma entrada por pagamento em dinheiro.
 * Cartão, PIX e transferência ficam na Conciliação. Usada pelo Vender, pela efetivação do
 * pedido e pelo Editar venda; peça e OS têm a sua (categoria e ligação diferentes).
 */
export function lancamentosDinheiroDaVenda(
  pagamentos: readonly { tipo: string; valor: number | string }[],
  base: { lojaId: string; usuarioId: string; vendaId: string; descricao: string; data: string },
) {
  return pagamentos
    .filter(p => p.tipo === 'dinheiro')
    .map(p => ({ ...base, tipo: 'entrada' as const, categoria: 'Venda', valor: Number(p.valor).toFixed(2) }))
}
