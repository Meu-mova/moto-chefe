// Custo x lucro por loja no /financeiro.
//
// A conta é a mesma do card de lucro líquido do topo da página, só que quebrada por
// loja: receita líquida − custo das motos − despesa. Não há imposto estimado por
// alíquota: o tributo que a empresa paga já vem no extrato como despesa (categoria
// "Impostos"), e descontar os dois contava o mesmo imposto duas vezes.
//
// A parte delicada é a despesa: no Sul de Minas 86% das saídas não têm loja atribuída
// no Importar do Banco, então a maior parte do custo de operar é uma massa sem dono.
// Ela é rateada entre as lojas na proporção do que cada uma faturou.

export type VendasDaLoja = {
  lojaId: string
  lojaNome: string
  qtdVendas: number
  /** Soma de vendas.valor, antes de descontar a taxa de cartão. */
  receitaBruta: number
  /** Receita já descontada da taxa de cartão das vendas conciliadas. */
  receitaLiquida: number
  /** Soma de motos.preco_compra das motos vendidas. */
  custoMotos: number
  /** Motos vendidas sem preço de compra cadastrado — o custo delas conta como zero. */
  qtdSemCusto: number
}

export type ResultadoLoja = VendasDaLoja & {
  /** Despesa que o Importar do Banco atribuiu a esta loja. */
  despesaPropria: number
  /** Parte da despesa sem loja que coube a esta loja no rateio. */
  despesaRateada: number
  /** receita líquida − custo das motos. */
  lucroBruto: number
  /** lucroBruto − despesas (próprias + rateadas). */
  lucroLiquido: number
  /** lucroLiquido ÷ receita bruta, em %. null quando a loja não vendeu nada. */
  margem: number | null
}

export type ResumoResultado = {
  lojas: ResultadoLoja[]
  /** Total sem loja que foi distribuído — mostrado como nota de rodapé. */
  despesaGeralRateada: number
  totais: {
    receitaBruta: number
    receitaLiquida: number
    custoMotos: number
    despesa: number
    lucroBruto: number
    lucroLiquido: number
    margem: number | null
  }
}

/**
 * @param despesaPorLoja chave `null` = despesa sem loja atribuída, que será rateada.
 */
export function calcularResultadoPorLoja(
  vendasPorLoja: VendasDaLoja[],
  despesaPorLoja: Map<string | null, number>,
): ResumoResultado {
  const despesaGeral = despesaPorLoja.get(null) ?? 0
  const receitaTotal = vendasPorLoja.reduce((a, v) => a + v.receitaBruta, 0)

  // Sem faturamento não há proporção — cai pra partes iguais, senão a despesa geral
  // sumiria da tabela e os totais não fechariam com o card do topo.
  const proporcao = (v: VendasDaLoja) =>
    receitaTotal > 0
      ? v.receitaBruta / receitaTotal
      : (vendasPorLoja.length > 0 ? 1 / vendasPorLoja.length : 0)

  const lojas: ResultadoLoja[] = vendasPorLoja.map(v => {
    const despesaPropria = despesaPorLoja.get(v.lojaId) ?? 0
    const despesaRateada = despesaGeral * proporcao(v)
    const lucroBruto = v.receitaLiquida - v.custoMotos
    const lucroLiquido = lucroBruto - despesaPropria - despesaRateada
    return {
      ...v,
      despesaPropria,
      despesaRateada,
      lucroBruto,
      lucroLiquido,
      margem: v.receitaBruta > 0 ? (lucroLiquido / v.receitaBruta) * 100 : null,
    }
  })

  const soma = (f: (l: ResultadoLoja) => number) => lojas.reduce((a, l) => a + f(l), 0)
  const receitaBruta = soma(l => l.receitaBruta)
  const lucroLiquido = soma(l => l.lucroLiquido)

  return {
    lojas,
    despesaGeralRateada: despesaGeral,
    totais: {
      receitaBruta,
      receitaLiquida: soma(l => l.receitaLiquida),
      custoMotos:    soma(l => l.custoMotos),
      despesa:       soma(l => l.despesaPropria + l.despesaRateada),
      lucroBruto:    soma(l => l.lucroBruto),
      lucroLiquido,
      margem: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : null,
    },
  }
}
