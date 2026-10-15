// Leitura página a página de uma lista do mcp.ai, testável sem rede.
//
// Sem page/page_size o mcp.ai devolve tudo numa página, mas com teto de 5000: acima disso corta os
// mais antigos (truncated:true). Com page_size (máx. 500) ele devolve `total`/`totalPages` reais.
// Medido em 14/10/2026: a Sicoob tem 5689 linhas, 12 páginas em ~10 s.

export type PaginaMcp<T> = { linhas: T[]; total: number; totalPages: number }

/** `'erro'` na página 1 = a conta é pulada, como o sync sempre fez; nas seguintes = leitura falha. */
export type BuscaPagina<T> = (pagina: number) => Promise<PaginaMcp<T> | 'erro'>

export type MotivoRejeicao = 'total_mudou' | 'ids_diferentes' | 'vazia_apos_dados'

/** Uma tentativa de leitura que não passou nas conferências; só números, para o log. */
export type Rejeicao = { tentativa: number; motivo: MotivoRejeicao; totalPrimeira: number; totalUltima: number; unicas: number }

export type ResultadoLeitura<T> =
  | { ok: true; linhas: T[]; paginas: number; total: number; ignorada: boolean; tentativas: number }
  | { ok: false; erro: string }

/**
 * Lê todas as páginas. As páginas são lidas em momentos diferentes: se uma linha some no meio
 * (reemissão), as seguintes sobem uma posição e uma linha é pulada sem aviso. Duas conferências, com
 * releitura se qualquer uma falhar: o `total` da primeira e da última página devem ser iguais, e o
 * número de linhas únicas lidas deve ser igual ao `total`. A segunda pega o caso em que uma entrada e
 * uma saída se compensam (o total final não muda, mas uma linha foi pulada). Ela vale porque os IDs
 * são únicos no mcp.ai: na Sicoob, 5689 linhas lidas, 5689 IDs únicos (14/10/2026). Linha repetida
 * (entrou uma nova no topo) é descartada por `chave`.
 *
 * Terceira conferência: `total` 0 depois de uma tentativa que viu linhas não vale. Foi o que a PIX
 * recebeu do Sicoob em 15/10/2026: a 1ª tentativa leu 2,5 MB e foi rejeitada, a 2ª veio com total 0 (formato
 * válido) e o sync foi gravado como completo sem nenhuma transação da conta. Um total 0 logo na 1ª
 * tentativa continua valendo: conta nova ou janela incremental sem movimento é legítima.
 */
export async function lerTodasAsPaginas<T>(
  buscar: BuscaPagina<T>,
  chave: (linha: T) => string,
  opts: { maxPaginas: number; maxTentativas: number; aoRejeitar?: (r: Rejeicao) => void },
): Promise<ResultadoLeitura<T>> {
  let maiorTotal = 0
  let ultimoMotivo: MotivoRejeicao | null = null
  for (let tentativa = 1; tentativa <= opts.maxTentativas; tentativa++) {
    const primeira = await buscar(1)
    if (primeira === 'erro') return { ok: true, linhas: [], paginas: 0, total: 0, ignorada: true, tentativas: tentativa }

    if (primeira.total === 0 && maiorTotal > 0) {
      ultimoMotivo = 'vazia_apos_dados'
      opts.aoRejeitar?.({ tentativa, motivo: ultimoMotivo, totalPrimeira: 0, totalUltima: 0, unicas: 0 })
      continue
    }
    maiorTotal = Math.max(maiorTotal, primeira.total)

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

    if (totalNaUltima === primeira.total && vistas.size === primeira.total) {
      return { ok: true, linhas: [...vistas.values()], paginas: primeira.totalPages, total: primeira.total, ignorada: false, tentativas: tentativa }
    }
    maiorTotal = Math.max(maiorTotal, totalNaUltima)
    ultimoMotivo = totalNaUltima !== primeira.total ? 'total_mudou' : 'ids_diferentes'
    opts.aoRejeitar?.({ tentativa, motivo: ultimoMotivo, totalPrimeira: primeira.total, totalUltima: totalNaUltima, unicas: vistas.size })
  }
  return {
    ok: false,
    erro: ultimoMotivo === 'vazia_apos_dados'
      ? 'O mcp.ai devolveu o extrato vazio depois de ter devolvido linhas; tente de novo.'
      : 'O extrato mudou durante a leitura e não estabilizou; tente de novo.',
  }
}

/** Acima disso, uma página de 0 linhas não é um extrato vazio: um extrato vazio cabe em algumas centenas de bytes. */
export const BYTES_MAX_PAGINA_VAZIA = 1000

/**
 * Resposta de `total: 0` que não parece um extrato vazio de verdade: traz `warning` ou um corpo grande demais
 * para zero linhas. Em 15/10/2026 o mcp.ai devolveu 1534 bytes com total 0 para o Sicredi (20 linhas reais) e
 * antes para o Sicoob; o sync foi gravado como completo sem essas contas. Tratada como erro, a conta é pulada
 * e o sync não avança a data. `total` ≠ 0 nunca é suspeita.
 */
export function vaziaSuspeita(payload: { total?: unknown; warning?: unknown }, bytes: number): boolean {
  if (payload.total !== 0) return false
  if (typeof payload.warning === 'string' && payload.warning.trim() !== '') return true
  return bytes > BYTES_MAX_PAGINA_VAZIA
}
