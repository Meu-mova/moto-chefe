// Premiação aplicável = a faixa de maior valorMinimoVendas que o total atingiu/ultrapassou.
export function calcularPremiacao(totalVendido: number, faixas: { valorMinimoVendas: string; premiacao: string }[]): number {
  const ordenadas = [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas))
  let melhor = 0
  for (const f of ordenadas) {
    if (totalVendido >= parseFloat(f.valorMinimoVendas)) melhor = parseFloat(f.premiacao)
  }
  return melhor
}
