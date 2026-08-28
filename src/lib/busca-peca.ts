import { normalizar } from './texto'

export type PecaBuscavel = { nome: string }

/**
 * Filtra o catálogo pelo que o balconista digitou.
 *
 * Casa por termo, não pela frase inteira: o catálogo tem nomes como
 * "Viseira (JET/ JET MAX)" e "PARALAMA DIANTEIRO FANTOM", então quem digita
 * "viseira jet" ou "fantom paralama" precisa achar do mesmo jeito. Acento e
 * caixa não contam.
 *
 * Ordena o que COMEÇA com o que foi digitado antes do resto — buscar "viseira"
 * tem que trazer as viseiras no topo, não uma peça que só menciona viseira no
 * meio do nome. Empate mantém a ordem alfabética que veio do banco.
 */
export function filtrarPecas<T extends PecaBuscavel>(pecas: T[], busca: string, limite = 40): T[] {
  const termos = normalizar(busca).split(' ').filter(Boolean)
  if (termos.length === 0) return pecas.slice(0, limite)

  const prefixo = termos.join(' ')
  const achados: { peca: T; comeca: boolean }[] = []

  for (const peca of pecas) {
    const nome = normalizar(peca.nome)
    if (!termos.every(t => nome.includes(t))) continue
    achados.push({ peca, comeca: nome.startsWith(prefixo) })
    // Sem corte antecipado: um "começa com" pode aparecer depois do 40º casamento
    // e ele é justamente o que o balconista quer ver primeiro.
  }

  return achados
    .sort((a, b) => Number(b.comeca) - Number(a.comeca))
    .slice(0, limite)
    .map(a => a.peca)
}
