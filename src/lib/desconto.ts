/**
 * Aritmética do desconto concedido em venda abaixo do preço mínimo.
 *
 * O desconto não é campo da venda: nasce do pedido de aprovação (aprovacoes_venda,
 * tipo 'valor_minimo'), que desde a migração 0065 congela os dois lados da conta —
 * o piso do modelo e o líquido recebido — no instante em que a venda foi barrada.
 *
 * Duas medidas, porque elas respondem coisas diferentes e a diferença entre as
 * duas é a taxa da maquininha:
 *   margem — quanto faltou pro piso DEPOIS das taxas
 *   preço  — quanto o vendedor cedeu na negociação, sobre o valor cheio
 *
 * Uma venda de 10.908 em 12x com piso de 10.490 tem preço 0 (vendeu acima da
 * tabela) e margem 500,99 (a taxa comeu). Sem as duas colunas não dá pra separar
 * quem negocia mal de quem parcela muito.
 */

/** A partir daqui existe registro de desconto — antes o fluxo de aprovação não existia. */
export const DESCONTO_REGISTRADO_DESDE = '2026-07-10'

export type LinhaDesconto = {
  valorMinimoSnapshot: string | null
  liquidoSnapshot: string | null
  /** Valor bruto da venda (vendas.valor). */
  valor: string
  snapshotEstimado: boolean
}

export type Desconto = { margem: number; preco: number }

const num = (v: string | null) => (v === null ? null : parseFloat(v))

/**
 * Desconto de uma linha, ou null quando não há snapshot — aprovação de
 * 'pagamento_sensivel' não tem, e inventar zero a contaria como venda no preço.
 *
 * Nenhuma das duas medidas fica negativa. Nas linhas estimadas pelo backfill o
 * piso é o de hoje, e quando a tabela caiu depois da venda a conta dá negativo:
 * um "desconto" de -510 abateria o desconto real de outra venda na mesma soma.
 */
export function calcDesconto(l: LinhaDesconto): Desconto | null {
  const minimo = num(l.valorMinimoSnapshot)
  const liquido = num(l.liquidoSnapshot)
  if (minimo === null || liquido === null) return null
  const bruto = parseFloat(l.valor)
  return {
    margem: Math.max(0, minimo - liquido),
    preco: Math.max(0, minimo - (isNaN(bruto) ? 0 : bruto)),
  }
}

export type SomaDescontos = {
  /** Vendas com desconto de fato apurado (linha sem snapshot não entra). */
  qtd: number
  margem: number
  preco: number
  /** Quantas das qtd vieram do backfill, com o piso de hoje. */
  estimados: number
}

export function somarDescontos(linhas: LinhaDesconto[]): SomaDescontos {
  return linhas.reduce<SomaDescontos>((acc, l) => {
    const d = calcDesconto(l)
    if (!d) return acc
    acc.qtd++
    acc.margem += d.margem
    acc.preco += d.preco
    if (l.snapshotEstimado) acc.estimados++
    return acc
  }, { qtd: 0, margem: 0, preco: 0, estimados: 0 })
}

/**
 * Fatia das vendas do período que precisou de aprovação, em %.
 * Desconto absoluto favorece quem vende pouco — quem vende mais desconta mais.
 */
export function percentualComDesconto(comDesconto: number, totalVendas: number): number {
  if (totalVendas <= 0) return 0
  return Math.round((comDesconto / totalVendas) * 1000) / 10
}

/** O período começa antes de existir registro de desconto? A tela precisa avisar. */
export function periodoAnteriorAoRegistro(dataInicio?: string): boolean {
  if (!dataInicio) return false
  return dataInicio < DESCONTO_REGISTRADO_DESDE
}
