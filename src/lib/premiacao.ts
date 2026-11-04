type Faixa = { valorMinimoVendas: string; premiacao: string }

export const ordenarFaixas = <F extends Faixa>(faixas: F[]): F[] =>
  [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas))

// Premiação aplicável = a faixa de maior valorMinimoVendas que o total atingiu/ultrapassou.
export function calcularPremiacao(totalVendido: number, faixas: Faixa[]): number {
  let melhor = 0
  for (const f of ordenarFaixas(faixas)) {
    if (totalVendido >= parseFloat(f.valorMinimoVendas)) melhor = parseFloat(f.premiacao)
  }
  return melhor
}
