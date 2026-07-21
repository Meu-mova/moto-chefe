export type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

export const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

export type PgtoOS = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }

type PgtoItem = { tipo: string; valor: number }

type ConcMatch = { id: string; autorizacao: string | null; valorBruto: string | number }
type PixMatch  = { id: string }

// Vendas, peças e OS podem ter mais de uma forma de pagamento por cartão/pix no mesmo
// carrinho (ex.: Pix + Cartão). Casa cada item do array `pagamentos` com uma conciliação
// de cartão (por autorização, depois por valor) ou recebimento Pix, individualmente —
// para que cada forma de pagamento possa ser conciliada de forma independente na UI.
export function matchPagamentos(pgtos: PgtoOS[], concs: ConcMatch[], pixRecs: PixMatch[]): boolean[] {
  const usados    = new Set<string>()
  const resultado = pgtos.map(() => false)

  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || !p.autorizacao) return
    const m = concs.find(c => !usados.has(c.id) && c.autorizacao === p.autorizacao)
    if (m) { resultado[i] = true; usados.add(m.id) }
  })

  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || resultado[i]) return
    const m = concs.find(c => !usados.has(c.id) && Math.abs(Number(c.valorBruto) - p.valor) <= 0.05)
    if (m) { resultado[i] = true; usados.add(m.id) }
  })

  if (pixRecs.length > 0) {
    pgtos.forEach((p, i) => { if (p.tipo === 'pix') resultado[i] = true })
  }

  return resultado
}

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
