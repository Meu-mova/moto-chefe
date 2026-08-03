// ─── Números digitados no padrão brasileiro ───────────────────────────────────
// O parser anterior fazia `replace(/\./g, '').replace(',', '.')`: apagava TODOS
// os pontos antes de olhar a vírgula. Quem digitasse "1880.50" — ponto como
// separador decimal, hábito comum — salvava 188050. Num campo de salário isso
// passa despercebido até alguém conferir a folha. "0.5" de comissão virava 5%.
//
// Aqui a regra é explícita: o separador decimal é o ÚLTIMO símbolo que aparece,
// e o outro é separador de milhar. Quando só há pontos, "1.880" é milhar (o
// grupo final tem exatamente 3 dígitos) e "1880.50" é decimal.

/** Converte texto digitado em número. Devolve null se não der pra ler — nunca 0 por engano. */
export function parseNumeroBR(texto: string): number | null {
  const s = texto.trim()
  if (!s) return null
  if (!/^-?[\d.,\s]+$/.test(s)) return null

  const limpo = s.replace(/\s/g, '')
  const negativo = limpo.startsWith('-')
  const corpo = negativo ? limpo.slice(1) : limpo

  const ultimaVirgula = corpo.lastIndexOf(',')
  const ultimoPonto = corpo.lastIndexOf('.')

  let normalizado: string
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // Os dois presentes: o último é o decimal, o outro é milhar.
    const decimal = Math.max(ultimaVirgula, ultimoPonto)
    normalizado = corpo.slice(0, decimal).replace(/[.,]/g, '') + '.' + corpo.slice(decimal + 1)
  } else if (ultimaVirgula >= 0) {
    // Só vírgula: sempre decimal no padrão brasileiro.
    normalizado = corpo.slice(0, ultimaVirgula).replace(/\./g, '') + '.' + corpo.slice(ultimaVirgula + 1)
  } else if (ultimoPonto >= 0) {
    // Só ponto: milhar se o formato for 1.234 / 1.234.567; senão é decimal.
    normalizado = /^\d{1,3}(\.\d{3})+$/.test(corpo) ? corpo.replace(/\./g, '') : corpo
  } else {
    normalizado = corpo
  }

  const n = parseFloat(normalizado)
  if (!isFinite(n)) return null
  return negativo ? -n : n
}

/** Formata para exibição/edição no padrão brasileiro: 1880 → "1.880,00". */
export function formatarNumeroBR(valor: string | number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = typeof valor === 'number' ? valor : parseFloat(valor)
  if (!isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
