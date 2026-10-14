// Leitura página a página de uma lista do mcp.ai, testável sem rede.
//
// Sem page/page_size o mcp.ai devolve tudo numa página, mas com teto de 5000: acima disso corta os
// mais antigos (truncated:true). Com page_size (máx. 500) ele devolve `total`/`totalPages` reais.
// Medido em 14/10/2026: a Sicoob tem 5689 linhas, 12 páginas em ~10 s.

export type PaginaMcp<T> = { linhas: T[]; total: number; totalPages: number }

/** `'erro'` na página 1 = a conta é pulada, como o sync sempre fez; nas seguintes = leitura falha. */
export type BuscaPagina<T> = (pagina: number) => Promise<PaginaMcp<T> | 'erro'>

export type ResultadoLeitura<T> =
  | { ok: true; linhas: T[]; paginas: number; total: number; ignorada: boolean; tentativas: number }
  | { ok: false; erro: string }

/**
 * Lê todas as páginas. As páginas são lidas em momentos diferentes: se uma linha some no meio
 * (reemissão), as seguintes sobem uma posição e uma linha é pulada sem aviso. O `total` informado
 * muda nesse caso, então comparo o da primeira e o da última página e releio se divergirem.
 * Linha repetida (entrou uma nova no topo) é descartada por `chave`.
 */
export async function lerTodasAsPaginas<T>(
  buscar: BuscaPagina<T>,
  chave: (linha: T) => string,
  opts: { maxPaginas: number; maxTentativas: number },
): Promise<ResultadoLeitura<T>> {
  for (let tentativa = 1; tentativa <= opts.maxTentativas; tentativa++) {
    const primeira = await buscar(1)
    if (primeira === 'erro') return { ok: true, linhas: [], paginas: 0, total: 0, ignorada: true, tentativas: tentativa }

    if (primeira.totalPages > opts.maxPaginas) {
      return { ok: false, erro: `Extrato com ${primeira.totalPages} páginas, acima do limite de ${opts.maxPaginas}.` }
    }

    const vistas = new Map<string, T>()
    for (const l of primeira.linhas) vistas.set(chave(l), l)
    let totalNaUltima = primeira.total

    for (let pagina = 2; pagina <= primeira.totalPages; pagina++) {
      const p = await buscar(pagina)
      if (p === 'erro') return { ok: false, erro: `O mcp.ai falhou na página ${pagina} de ${primeira.totalPages}.` }
      for (const l of p.linhas) vistas.set(chave(l), l)
      totalNaUltima = p.total
    }

    if (totalNaUltima === primeira.total) {
      return { ok: true, linhas: [...vistas.values()], paginas: primeira.totalPages, total: primeira.total, ignorada: false, tentativas: tentativa }
    }
  }
  return { ok: false, erro: 'O extrato mudou durante a leitura e não estabilizou; tente de novo.' }
}
