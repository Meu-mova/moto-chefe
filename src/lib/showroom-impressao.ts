// Impressão do Showroom (#512): motos agrupadas por modelo, com quantidade. Preço só
// chega aqui para sócio e admin_geral; sem o mapa de preços, nenhum valor sai.

type MotoImpressa = { modelo: string; marca: string; chassi: string; cor: string; status: string; lojaNome: string | null }

export function agruparPorModelo<M extends MotoImpressa>(motos: M[], precos: Map<string, string | null> | null) {
  const comValores = precos !== null
  const grupos = new Map<string, { modelo: string; marca: string; motos: (M & { preco: number | null })[] }>()
  for (const m of motos) {
    const chave = `${m.marca}|${m.modelo}`
    if (!grupos.has(chave)) grupos.set(chave, { modelo: m.modelo, marca: m.marca, motos: [] })
    grupos.get(chave)!.motos.push({ ...m, preco: comValores ? Number(precos.get(m.chassi) ?? 0) : null })
  }
  const soma = (ls: { preco: number | null }[]) => (comValores ? ls.reduce((s, m) => s + (m.preco ?? 0), 0) : null)
  const lista = [...grupos.values()].map(g => ({ ...g, quantidade: g.motos.length, subtotal: soma(g.motos) }))
  return { grupos: lista, quantidade: motos.length, total: soma(lista.flatMap(g => g.motos)) }
}
