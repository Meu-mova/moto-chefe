/**
 * Formas de pagamento da ENTRADA de uma reserva.
 *
 * Até a migração 0088 a reserva tinha uma forma só (`meio_pagamento` + as duas
 * colunas de cartão). Agora a entrada pode ser dividida, e o detalhamento vive
 * em `reservas.pagamentos` (jsonb), no mesmo formato de `pedidos_venda.pagamentos`.
 *
 * `meio_pagamento` continua preenchido com o tipo da PRIMEIRA linha — é o que o
 * comprovante impresso, o histórico do estoque e as subqueries de queries/motos
 * já leem. Reserva antiga tem `pagamentos` nulo e é normalizada aqui.
 */

export type PagamentoReserva = {
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

type ReservaLegado = {
  pagamentos: unknown
  meioPagamento: string
  valorReserva: string | number
  cartaoOperadora?: string | null
  cartaoParcelas?: string | number | null
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? 0 : n
}

export function normalizarPagamentosReserva(r: ReservaLegado): PagamentoReserva[] {
  if (Array.isArray(r.pagamentos) && r.pagamentos.length > 0) {
    return (r.pagamentos as PagamentoReserva[]).map(p => ({
      tipo: p.tipo,
      valor: num(p.valor),
      ...(p.operadora ? { operadora: p.operadora } : {}),
      ...(p.parcelas ? { parcelas: Number(p.parcelas) } : {}),
    }))
  }
  // Legado: uma linha só, montada a partir das colunas antigas.
  return [{
    tipo: r.meioPagamento,
    valor: num(r.valorReserva),
    ...(r.cartaoOperadora ? { operadora: r.cartaoOperadora } : {}),
    ...(r.cartaoParcelas ? { parcelas: Number(r.cartaoParcelas) } : {}),
  }]
}

export function somaPagamentos(pgs: PagamentoReserva[]): number {
  return pgs.reduce((a, p) => a + num(p.valor), 0)
}

/** A soma das formas tem que bater com a entrada, com folga de um centavo. */
export function pagamentosFecham(pgs: PagamentoReserva[], valorEntrada: number): boolean {
  if (!(valorEntrada > 0) || pgs.length === 0) return false
  return Math.abs(somaPagamentos(pgs) - valorEntrada) < 0.01
}

function fmtBRL(v: number): string {
  const [inteiro, centavos] = v.toFixed(2).split('.')
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`
}

/** "PIX R$ 500,00 + Cartão de Crédito 3x R$ 500,00" — histórico e comprovante. */
export function descreverPagamentos(pgs: PagamentoReserva[]): string {
  return pgs
    .map(p => {
      const label = LABEL_MEIO_PAGAMENTO[p.tipo] ?? p.tipo
      const parcelas = p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''
      return `${label}${parcelas} ${fmtBRL(num(p.valor))}`
    })
    .join(' + ')
}
