export type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

type PgtoItem = { tipo: string; valor: number }

// Peças: pagamento pode ter múltiplos itens (carrinho com pix + cartão + dinheiro, etc.),
// mesma lógica usada em vendas de moto.
export function calcStatusMultiPagamento(
  pagamentos: unknown,
  conciliadoValor: number,
  pixConciliadoValor: number,
  valorTotal: string,
): StatusConc {
  const pgtos = (pagamentos ?? []) as PgtoItem[]
  if (pgtos.length === 0) return 'na'

  const totalCartao = pgtos.filter(p => TIPOS_CARTAO.has(p.tipo)).reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalPix     = pgtos.filter(p => p.tipo === 'pix').reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)

  if (totalLancado < Number(valorTotal) - 0.05) return 'parcial'

  const totalNecessario = totalCartao + totalPix
  if (totalNecessario < 0.01) return 'conciliada' // só dinheiro/financiamento

  const conciliado = (Number(conciliadoValor) || 0) + (Number(pixConciliadoValor) || 0)
  if (conciliado < 0.01) return 'pendente'
  if (conciliado >= totalNecessario - 0.05) return 'conciliada'
  return 'parcial'
}

// OS: pagamento único por fechamento. Forma não-cartão não grava `pagamentos` (fica null),
// então o cálculo usa a forma direto em vez do array.
const FORMAS_CARTAO_OS = new Set(['Cartão de Crédito', 'Cartão de Débito'])

export function calcStatusPagamentoUnicoOS(
  formaPagamento: string | null,
  valorTotal: string | null,
  conciliadoValor: number,
  pixConciliadoValor: number,
): StatusConc {
  if (!formaPagamento) return 'na'

  const ehCartao = FORMAS_CARTAO_OS.has(formaPagamento)
  const ehPix     = formaPagamento === 'PIX'
  if (!ehCartao && !ehPix) return 'conciliada' // dinheiro/transferência/cortesia — não precisa conciliar

  const valor = Number(valorTotal) || 0
  const conciliado = ehCartao ? (Number(conciliadoValor) || 0) : (Number(pixConciliadoValor) || 0)
  if (conciliado < 0.01) return 'pendente'
  if (conciliado >= valor - 0.05) return 'conciliada'
  return 'parcial'
}
