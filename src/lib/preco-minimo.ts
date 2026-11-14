export type TaxasVenda = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

export type PgtoCalc = {
  tipo: string
  valor: number
  parcelas?: number
}

// Tipos que não têm taxa — vendedor recebe o valor integral
const SEM_TAXA = new Set(['pix', 'dinheiro', 'transferencia', 'financiamento'])

// Tabela de taxa por número de parcelas de cada tipo parcelado (financiamento está em SEM_TAXA)
const TAXA_PARCELADA: Record<string, keyof TaxasVenda> = {
  cartao_credito: 'taxasCartao',
  link_pagamento: 'taxasLink',
}

// Líquido que o vendedor recebe de um pagamento (após taxa da operadora/financeira)
function liquidoDePgto(p: PgtoCalc, taxas: TaxasVenda): number {
  const v = p.valor
  if (SEM_TAXA.has(p.tipo)) return v

  if (p.tipo === 'cartao_debito') {
    const taxa = taxas.taxasDebito['1'] ?? 0
    return taxa > 0 ? v / (1 + taxa) : v
  }

  if (!p.parcelas) return 0 // sem parcelas → não calculável → 0 para disparar aviso

  const tabela = TAXA_PARCELADA[p.tipo]
  if (!tabela) return v
  const taxa = taxas[tabela][String(p.parcelas)] ?? 0
  return taxa > 0 ? v / (1 + taxa) : v
}

// Soma do líquido recebido em todos os pagamentos
export function calcLiquidoRecebido(pagamentos: PgtoCalc[], taxas: TaxasVenda): number {
  return pagamentos.reduce((acc, p) => acc + liquidoDePgto(p, taxas), 0)
}

/** Parcelas (mais de 1) dos pagamentos que pagam taxa parcelada, sem repetir e em ordem: o "12x" do líquido. */
export function parcelasComTaxa(pagamentos: PgtoCalc[]): number[] {
  const parcelas = pagamentos
    .filter(p => Object.hasOwn(TAXA_PARCELADA, p.tipo) && (p.parcelas ?? 0) > 1)
    .map(p => p.parcelas as number)
  return [...new Set(parcelas)].sort((a, b) => a - b)
}

// Verifica se o total é suficiente dado o preço mínimo PIX
export function validarPrecoVenda(
  pagamentos: PgtoCalc[],
  precoMinimoPix: number,
  taxas: TaxasVenda
): { valido: boolean; liquido: number; deficit: number } {
  const liquido = calcLiquidoRecebido(pagamentos, taxas)
  const deficit = Math.max(0, precoMinimoPix - liquido)
  return { valido: deficit < 0.01, liquido, deficit }
}

// Valida a reserva: entrada mínima de 30% do preço PIX
export function validarReserva(
  valorEntrada: number,
  valorTotalVenda: number,
  precoMinimoPix: number
): { entradaOk: boolean; totalOk: boolean; minimoEntrada: number } {
  const minimoEntrada = precoMinimoPix * 0.3
  return {
    entradaOk: valorEntrada >= minimoEntrada - 0.01,
    totalOk: valorTotalVenda >= precoMinimoPix - 0.01,
    minimoEntrada,
  }
}

export function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
