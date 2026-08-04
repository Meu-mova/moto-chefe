// ─── Lojas fora do relatório de vendas para a fábrica ─────────────────────────
// O relatório mostra à fábrica o que foi vendido nos pontos de venda. Duas lojas
// do Sul de Minas ficam de fora, por decisão do Cesar:
//
//   Galpão Matriz — estoque central de chegada, não é ponto de venda; moto que
//                   sai de lá seria contada duas vezes na leitura da fábrica.
//   Lavras        — excluída a pedido.
//
// Mesmo padrão de LOJA_GALPAO_MATRIZ_ID em @/lib/loja-galpao: ID fixo e
// comentado, porque `lojas` não tem coluna que distinga ponto de venda de
// depósito. Se um dia a distinção virar dado, isto some.
export const LOJAS_FORA_RELATORIO_FABRICA: readonly string[] = [
  'f154c1a5-c5ed-4bdc-af14-b1dea024beae', // Galpão Matriz
  'd27be175-1a99-4382-a335-7a027195922e', // Lavras
]

export function lojaEntraNoRelatorioFabrica(lojaId: string): boolean {
  return !LOJAS_FORA_RELATORIO_FABRICA.includes(lojaId)
}

export type LinhaModeloLoja = {
  modeloId: string
  marca: string
  modelo: string
  lojaId: string
  lojaNome: string
  quantidade: number
  valor: number
}

export type GrupoLoja = {
  lojaId: string
  lojaNome: string
  modelos: { marca: string; modelo: string; quantidade: number; valor: number }[]
  quantidade: number
  valor: number
}

/**
 * Agrupa as linhas (modelo × loja) por loja, com subtotal por loja.
 * A fábrica quer ler o quanto cada ponto de venda vendeu, então a loja é o
 * nível de cima e os modelos ficam listados dentro dela.
 *
 * Ordena as lojas por quantidade vendida (a que mais vendeu primeiro) e, dentro
 * de cada loja, os modelos também por quantidade — o que sai mais aparece antes.
 */
export function agruparPorLoja(linhas: LinhaModeloLoja[]): GrupoLoja[] {
  const porLoja = new Map<string, GrupoLoja>()

  for (const l of linhas) {
    let g = porLoja.get(l.lojaId)
    if (!g) {
      g = { lojaId: l.lojaId, lojaNome: l.lojaNome, modelos: [], quantidade: 0, valor: 0 }
      porLoja.set(l.lojaId, g)
    }
    g.modelos.push({ marca: l.marca, modelo: l.modelo, quantidade: l.quantidade, valor: l.valor })
    g.quantidade += l.quantidade
    g.valor += l.valor
  }

  const grupos = [...porLoja.values()]
  for (const g of grupos) g.modelos.sort((a, b) => b.quantidade - a.quantidade || a.modelo.localeCompare(b.modelo))
  grupos.sort((a, b) => b.quantidade - a.quantidade || a.lojaNome.localeCompare(b.lojaNome))
  return grupos
}
