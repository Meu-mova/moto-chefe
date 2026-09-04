/**
 * Formas de pagamento de um valor recebido antes da venda: a ENTRADA da reserva
 * (migração 0088) e o SINAL da demanda (0089).
 *
 * Antes cada um tinha uma forma só, em `meio_pagamento`. Agora o detalhamento
 * vive na coluna `pagamentos` (jsonb), no mesmo formato de
 * `pedidos_venda.pagamentos`.
 *
 * `meio_pagamento` continua preenchido com o tipo da PRIMEIRA linha — é o que os
 * comprovantes impressos, o histórico do estoque e as subqueries de
 * queries/motos já leem. Registro antigo tem `pagamentos` nulo e é normalizado
 * aqui.
 */

export type PagamentoEntrada = {
  tipo: string
  valor: number
  operadora?: string
  parcelas?: number
}

export const LABEL_MEIO_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência',
}

type RegistroLegado = {
  pagamentos: unknown
  /** Forma única do registro antigo. Nulo em demanda sem sinal. */
  meioPagamento: string | null
  /** Valor total recebido — entrada da reserva ou sinal da demanda. */
  valorTotal: string | number | null
  cartaoOperadora?: string | null
  cartaoParcelas?: string | number | null
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? 0 : n
}

export function normalizarPagamentos(r: RegistroLegado): PagamentoEntrada[] {
  if (Array.isArray(r.pagamentos) && r.pagamentos.length > 0) {
    return (r.pagamentos as PagamentoEntrada[]).map(p => ({
      tipo: p.tipo,
      valor: num(p.valor),
      ...(p.operadora ? { operadora: p.operadora } : {}),
      ...(p.parcelas ? { parcelas: Number(p.parcelas) } : {}),
    }))
  }
  // Legado: uma linha só, montada a partir das colunas antigas. Sem meio de
  // pagamento não há o que mostrar (demanda sem sinal).
  if (!r.meioPagamento) return []
  return [{
    tipo: r.meioPagamento,
    valor: num(r.valorTotal),
    ...(r.cartaoOperadora ? { operadora: r.cartaoOperadora } : {}),
    ...(r.cartaoParcelas ? { parcelas: Number(r.cartaoParcelas) } : {}),
  }]
}

export function somaPagamentos(pgs: PagamentoEntrada[]): number {
  return pgs.reduce((a, p) => a + num(p.valor), 0)
}

/** A soma das formas tem que bater com a entrada, com folga de um centavo. */
export function pagamentosFecham(pgs: PagamentoEntrada[], valorEntrada: number): boolean {
  if (!(valorEntrada > 0) || pgs.length === 0) return false
  return Math.abs(somaPagamentos(pgs) - valorEntrada) < 0.01
}

function fmtBRL(v: number): string {
  const [inteiro, centavos] = v.toFixed(2).split('.')
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`
}

/** "PIX R$ 500,00 + Cartão de Crédito 3x R$ 500,00" — histórico e comprovante. */
export function descreverPagamentos(pgs: PagamentoEntrada[]): string {
  return pgs
    .map(p => {
      const label = LABEL_MEIO_PAGAMENTO[p.tipo] ?? p.tipo
      const parcelas = p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''
      return `${label}${parcelas} ${fmtBRL(num(p.valor))}`
    })
    .join(' + ')
}
