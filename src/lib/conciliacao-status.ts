export type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

export type PgtoOS = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }

type PgtoItem = { tipo: string; valor: number }

// Vendas, peças e OS: pagamento pode ter múltiplos itens (carrinho com pix + cartão +
// dinheiro, etc.). Reaproveitada pelas três telas — não duplicar essa lógica.
export function calcStatusMultiPagamento(
  pagamentos: unknown,
  conciliadoValor: number,
  pixConciliadoValor: number,
  valorTotal: string,
): StatusConc {
  // Venda/OS/peça de valor zero (ex.: OS gratuita) não tem nada a conciliar,
  // independente da forma de pagamento lançada.
  if (Number(valorTotal) < 0.01) return 'conciliada'

  const pgtos = (pagamentos ?? []) as PgtoItem[]
  if (pgtos.length === 0) return 'na'

  const totalCartao = pgtos.filter(p => TIPOS_CARTAO.has(p.tipo)).reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalPix     = pgtos.filter(p => p.tipo === 'pix').reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)

  if (totalLancado < Number(valorTotal) - 0.05) return 'parcial'

  const totalNecessario = totalCartao + totalPix
  if (totalNecessario < 0.01) return 'conciliada' // só dinheiro/financiamento/cortesia

  const conciliado = (Number(conciliadoValor) || 0) + (Number(pixConciliadoValor) || 0)
  if (conciliado < 0.01) return 'pendente'
  if (conciliado >= totalNecessario - 0.05) return 'conciliada'
  return 'parcial'
}

const LABEL_PARA_TIPO_OS: Record<string, string> = {
  'PIX':                  'pix',
  'Dinheiro':             'dinheiro',
  'Cartão de Crédito':    'cartao_credito',
  'Cartão de Débito':     'cartao_debito',
  'Transferência':        'transferencia',
  'Cortesia / Garantia':  'cortesia',
  'Gratuita':             'gratuita',
}

// OS abertas antes do pagamento multi-forma só gravavam o array `pagamentos` quando a
// forma era cartão — PIX/Dinheiro/Transferência/Cortesia ficavam só em `formaPagamento`
// (texto). Sintetiza um array de 1 item nesses casos pra reaproveitar
// calcStatusMultiPagamento sem perder o histórico de conciliação dessas OS.
export function pagamentosEfetivosOS(
  formaPagamento: string | null,
  pagamentos: unknown,
  valorTotal: string | null,
): PgtoOS[] {
  const arr = (pagamentos ?? []) as PgtoOS[]
  if (arr.length > 0) return arr
  if (!formaPagamento) return []
  const tipo = LABEL_PARA_TIPO_OS[formaPagamento] ?? formaPagamento.toLowerCase()
  return [{ tipo, valor: Number(valorTotal) || 0 }]
}
