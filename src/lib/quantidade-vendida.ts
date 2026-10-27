/**
 * Venda de peça só com quantidade inteira: o estoque é em unidades e o banco recusaria o
 * decimal no meio da transação com erro cru. `null` = aceito.
 */
export function recusaDaQuantidadeVendida(itens: readonly { quantidade: number }[]): string | null {
  return itens.every(i => Number.isInteger(i.quantidade)) ? null : 'Quantidade é em unidades inteiras, sem vírgula.'
}
