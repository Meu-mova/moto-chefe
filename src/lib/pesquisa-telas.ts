// Sem acento e sem caixa: "pecas" acha "Peças", "conciliacao" acha "Conciliação".
export function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function telaCasa(item: { label: string }, consulta: string) {
  const q = normalizar(consulta)
  return q === '' || normalizar(item.label).includes(q)
}
