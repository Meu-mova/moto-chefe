// Impressão do Showroom (#512): motos agrupadas por modelo, com quantidade. Preço só
// chega aqui para sócio e admin_geral; sem o mapa de preços, nenhum valor sai.
// Moto sem preço de compra fica fora da soma e é contada, para o total não parecer completo.

type MotoImpressa = { modelo: string; marca: string; chassi: string; cor: string; status: string; lojaNome: string | null }

export function agruparPorModelo<M extends MotoImpressa>(motos: M[], precos: Map<string, string | null> | null) {
  const comValores = precos !== null
  const precoDe = (chassi: string) => {
    const p = precos?.get(chassi)
    return p === null || p === undefined || p === '' ? null : Number(p)
  }
  const grupos = new Map<string, { modelo: string; marca: string; motos: (M & { preco: number | null })[] }>()
  for (const m of motos) {
    const chave = `${m.marca}|${m.modelo}`
    if (!grupos.has(chave)) grupos.set(chave, { modelo: m.modelo, marca: m.marca, motos: [] })
    grupos.get(chave)!.motos.push({ ...m, preco: precoDe(m.chassi) })
  }
  const soma = (ls: { preco: number | null }[]) => (comValores ? ls.reduce((s, m) => s + (m.preco ?? 0), 0) : null)
  const semPreco = (ls: { preco: number | null }[]) => (comValores ? ls.filter(m => m.preco === null).length : 0)
  const lista = [...grupos.values()].map(g => ({ ...g, quantidade: g.motos.length, subtotal: soma(g.motos), semPreco: semPreco(g.motos) }))
  const todas = lista.flatMap(g => g.motos)
  return { grupos: lista, quantidade: motos.length, total: soma(todas), semPreco: semPreco(todas), comValores }
}
