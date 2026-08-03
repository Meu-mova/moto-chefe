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

export type GrupoModelo = {
  modeloId: string
  marca: string
  modelo: string
  lojas: { lojaNome: string; quantidade: number; valor: number }[]
  quantidade: number
  valor: number
}

/**
 * Agrupa as linhas (modelo × loja) por modelo, com subtotal.
 * Ordena por quantidade vendida — o que a fábrica quer ver primeiro é o que sai mais.
 */
export function agruparPorModelo(linhas: LinhaModeloLoja[]): GrupoModelo[] {
  const porModelo = new Map<string, GrupoModelo>()

  for (const l of linhas) {
    let g = porModelo.get(l.modeloId)
    if (!g) {
      g = { modeloId: l.modeloId, marca: l.marca, modelo: l.modelo, lojas: [], quantidade: 0, valor: 0 }
      porModelo.set(l.modeloId, g)
    }
    g.lojas.push({ lojaNome: l.lojaNome, quantidade: l.quantidade, valor: l.valor })
    g.quantidade += l.quantidade
    g.valor += l.valor
  }

  const grupos = [...porModelo.values()]
  for (const g of grupos) g.lojas.sort((a, b) => a.lojaNome.localeCompare(b.lojaNome))
  grupos.sort((a, b) => b.quantidade - a.quantidade || a.modelo.localeCompare(b.modelo))
  return grupos
}
