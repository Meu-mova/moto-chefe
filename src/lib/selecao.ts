/** Seleção por caixinha: a do grupo fica marcada, vazia ou indeterminada conforme os itens dele. */
export type EstadoDaSelecao = 'nenhuma' | 'parte' | 'todas'

export function estadoDaSelecao<T>(ids: readonly T[], marcadas: ReadonlySet<T>): EstadoDaSelecao {
  const quantas = ids.filter(id => marcadas.has(id)).length
  if (quantas === 0) return 'nenhuma'
  return quantas === ids.length ? 'todas' : 'parte'
}

export function marcarVarias<T>(marcadas: ReadonlySet<T>, ids: readonly T[], ligar: boolean): Set<T> {
  const alvo = new Set(ids)
  const fora = [...marcadas].filter(id => !alvo.has(id))
  return new Set(ligar ? [...fora, ...ids] : fora)
}
