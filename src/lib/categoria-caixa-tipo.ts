// Tipo da categoria de caixa x tipo do lançamento (#834). "Ambos" serve à entrada e à saída.
// Tela e servidor decidem por aqui: a lista do /caixa/novo, a conferência ao gravar, o nome repetido
// e o "tem lançamento" do excluir.

export const TIPOS_CATEGORIA_CAIXA = ['entrada', 'saida', 'ambos'] as const
export type TipoLancamentoCaixa = 'entrada' | 'saida'

/** Os tipos de lançamento que a categoria atende. */
export function tiposDeLancamentoDa(tipoCategoria: string): TipoLancamentoCaixa[] {
  if (tipoCategoria === 'ambos') return ['entrada', 'saida']
  return tipoCategoria === 'entrada' || tipoCategoria === 'saida' ? [tipoCategoria] : []
}

export function serveAoLancamento(tipoCategoria: string, tipoLancamento: TipoLancamentoCaixa): boolean {
  return tiposDeLancamentoDa(tipoCategoria).includes(tipoLancamento)
}

/** Tipos de categoria que o lançamento desse tipo pode usar. */
export function tiposDeCategoriaPara(tipoLancamento: TipoLancamentoCaixa): string[] {
  return TIPOS_CATEGORIA_CAIXA.filter(t => serveAoLancamento(t, tipoLancamento))
}

/** Tipos com que o mesmo nome repete: os que atendem algum lançamento em comum (senão a opção sai duas vezes). */
export function tiposQueRepetem(tipoCategoria: string): string[] {
  const atende = tiposDeLancamentoDa(tipoCategoria)
  return TIPOS_CATEGORIA_CAIXA.filter(t => tiposDeLancamentoDa(t).some(l => atende.includes(l)))
}
