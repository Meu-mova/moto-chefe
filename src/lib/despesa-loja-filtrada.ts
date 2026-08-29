// O card "Despesas Operacionais" do /financeiro quando há UMA loja no filtro.
//
// A query da página traz `loja_id = X OR loja_id IS NULL`, ou seja, a despesa da
// loja mais o balde da estrutura da empresa (contabilidade, pró-labore, sistema —
// R$ 264.458,57 no Sul de Minas em agosto/2026). Somar os dois faz a loja
// filtrada carregar sozinha a estrutura do grupo inteiro: Itajubá aparecia com
// R$ 306.041,09 no card enquanto a tabela de resultado por loja mostrava
// R$ 102.474,92 pra mesma loja no mesmo mês. Abrindo as seis lojas uma a uma, os
// cards somavam R$ 1,79 milhão num mês de R$ 465 mil.
//
// A conta certa já existia em calcularResultadoPorLoja: despesa própria mais a
// fatia da estrutura proporcional ao faturamento. Aqui só lemos a linha daquela
// loja, pra o card e a tabela saírem da MESMA fonte e não poderem divergir de novo.

import type { TotalDespesas } from './despesas-operacionais'
import type { ResumoResultado } from './resultado-por-loja'

/** Linha que representa a fatia da estrutura no detalhamento por categoria. */
export const CATEGORIA_RATEIO = 'Rateio da estrutura (geral)'

export type DespesaDaLoja = {
  /** própria + rateada — é o número do card. */
  total: number
  /** O que o Importar do Banco atribuiu a esta loja, mais o caixa dela. */
  propria: number
  /** A fatia da despesa sem loja que coube a esta loja. */
  rateada: number
  /** Categorias próprias + a linha do rateio, da maior pra menor. Soma `total`. */
  porCategoria: { categoria: string; total: number }[]
}

export function despesaDaLojaFiltrada(
  resumo: TotalDespesas,
  resultado: ResumoResultado,
  lojaId: string,
): DespesaDaLoja {
  const linha = resultado.lojas.find(l => l.lojaId === lojaId)

  // Loja fora da tabela de resultado (não é loja de venda, como o Galpão Matriz
  // em alguns recortes) não recebe rateio — mostrar a estrutura inteira nela
  // seria repetir exatamente o erro que esta função existe pra evitar.
  const propria = linha?.despesaPropria ?? resumo.porLoja.get(lojaId) ?? 0
  const rateada = linha?.despesaRateada ?? 0

  const porCategoria = [...(resumo.porCategoriaPorLoja.get(lojaId) ?? [])]
  if (rateada > 0) porCategoria.push({ categoria: CATEGORIA_RATEIO, total: rateada })
  porCategoria.sort((a, b) => b.total - a.total)

  return { total: propria + rateada, propria, rateada, porCategoria }
}
