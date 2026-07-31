export type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

export const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

// Conciliação forçada na mão pelo admin_geral: o dinheiro entrou, mas não existe
// lançamento correspondente no sistema (relatório da operadora não importado, PIX
// fora do Open Finance, transferência avulsa). Fica gravada no próprio item do array
// `pagamentos` — ver docs/superpowers/specs/2026-07-31-forcar-conciliacao-design.md.
export type ConciliadoManual = { motivo: string; porId: string; porNome: string; em: string }

export type PgtoOS = {
  tipo: string
  valor: number
  operadora?: string
  parcelas?: number
  autorizacao?: string
  conciliadoManual?: ConciliadoManual | null
}

type PgtoItem = { tipo: string; valor: number; conciliadoManual?: ConciliadoManual | null }

// Só cartão e PIX entram na conta do que precisa ser conciliado — dinheiro,
// financiamento e cortesia nunca geram pendência, então forçá-los não soma nada.
export function precisaConciliar(tipo: string): boolean {
  return TIPOS_CARTAO.has(tipo) || tipo === 'pix'
}

// Total dos pagamentos marcados como conciliados na mão. Usado por
// calcStatusMultiPagamento e pelos dois pontos que fazem a conta em JS por fora
// (KPIs de /vendas e o calcStatus da tabela de vendas).
export function valorConciliadoManual(pagamentos: unknown): number {
  const pgtos = (pagamentos ?? []) as PgtoItem[]
  return pgtos
    .filter(p => p.conciliadoManual && precisaConciliar(p.tipo))
    .reduce((a, p) => a + (Number(p.valor) || 0), 0)
}

type ConcMatch = { id: string; autorizacao: string | null; valorBruto: string | number }
type PixMatch  = { id: string; valor: string | number }

/** Quanto do pagamento foi coberto por dinheiro que realmente entrou. */
export type CoberturaPgto = { conciliado: boolean; coberto: number }

// Vendas, peças e OS podem ter mais de uma forma de pagamento por cartão/pix no mesmo
// carrinho (ex.: Pix + Cartão). Casa cada item do array `pagamentos` com o que entrou,
// individualmente, para que cada forma possa ser conciliada de forma independente na UI.
//
// A linha só fecha quando o VALOR recebido cobre o valor lançado. Antes bastava existir
// a transação: um PIX de R$ 5.990 fechava um pagamento de R$ 10.990, e um cartão casado
// por autorização fechava mesmo vindo com valor menor. O resultado era a tela de
// detalhes toda verde enquanto o badge da listagem — que sempre comparou valores —
// dizia "Parcial". Quem manda é o valor; ver calcStatusMultiPagamento.
export function matchPagamentos(pgtos: PgtoOS[], concs: ConcMatch[], pixRecs: PixMatch[]): CoberturaPgto[] {
  const usados    = new Set<string>()
  const resultado: CoberturaPgto[] = pgtos.map(() => ({ conciliado: false, coberto: 0 }))

  // Forçados entram antes dos laços automáticos: assim o match por valor (que pula
  // índices já resolvidos) não gasta uma transação real num pagamento que já foi
  // fechado na mão, deixando o irmão de mesmo valor pendente à toa.
  pgtos.forEach((p, i) => {
    if (p.conciliadoManual) resultado[i] = { conciliado: true, coberto: p.valor }
  })

  // Cartão pela autorização: é a transação certa, mesmo que o valor tenha vindo
  // diferente. Cobre o que a operadora reportou — a diferença fica visível na tela.
  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || !p.autorizacao || resultado[i].conciliado) return
    const m = concs.find(c => !usados.has(c.id) && c.autorizacao === p.autorizacao)
    if (m) { resultado[i].coberto = Number(m.valorBruto); usados.add(m.id) }
  })

  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || resultado[i].conciliado || resultado[i].coberto > 0) return
    const m = concs.find(c => !usados.has(c.id) && Math.abs(Number(c.valorBruto) - p.valor) <= 0.05)
    if (m) { resultado[i].coberto = Number(m.valorBruto); usados.add(m.id) }
  })

  // Transações vinculadas à venda que não casaram com nenhuma linha (ex.: uma cobrança
  // agregada para dois pagamentos) ainda são dinheiro que entrou — rateia no que falta,
  // senão a listagem diria "conciliada" com todas as linhas vermelhas.
  let sobraCartao = concs.filter(c => !usados.has(c.id)).reduce((a, c) => a + Number(c.valorBruto), 0)
  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || resultado[i].conciliado || sobraCartao <= 0) return
    const falta = p.valor - resultado[i].coberto
    if (falta <= 0.05) return
    const usa = Math.min(falta, sobraCartao)
    resultado[i].coberto += usa
    sobraCartao -= usa
  })

  // PIX não tem autorização para casar: rateia o total recebido entre os pagamentos
  // PIX, na ordem. Dois PIX lançados e um só recebimento fecham um, não os dois.
  let poolPix = pixRecs.reduce((a, r) => a + (Number(r.valor) || 0), 0)
  pgtos.forEach((p, i) => {
    if (p.tipo !== 'pix' || resultado[i].conciliado || poolPix <= 0) return
    const usa = Math.min(p.valor, poolPix)
    resultado[i].coberto += usa
    poolPix -= usa
  })

  resultado.forEach((r, i) => {
    if (r.conciliado) return
    r.conciliado = precisaConciliar(pgtos[i].tipo) && r.coberto >= pgtos[i].valor - 0.05
  })

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

  const conciliado = (Number(conciliadoValor) || 0)
    + (Number(pixConciliadoValor) || 0)
    + valorConciliadoManual(pgtos)
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
