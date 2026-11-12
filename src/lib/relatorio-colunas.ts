// Achar colunas de relatório de operadora pelo NOME do cabeçalho, não pela posição: a operadora
// muda o layout, e coluna trocada grava valor errado sem aviso. Pura, comum aos leitores.

// Só letras ASCII e números, em minúscula: "Código" e "C�digo" (acento mal decodificado) viram
// o mesmo "cdigo", e o arquivo em latin-1 lido como UTF-8 não derruba a busca da coluna.
export const chaveDaColuna = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Posição de cada coluna pedida no cabeçalho, ou os nomes das que faltam. */
export function indicesDasColunas<C extends Record<string, string>>(
  cabecalho: string[],
  colunas: C,
): Record<keyof C, number> | { faltam: string[] } {
  const nomes = cabecalho.map(chaveDaColuna)
  const achados = Object.entries(colunas).map(([campo, nome]) => [campo, nomes.indexOf(chaveDaColuna(nome)), nome] as const)
  const faltam = achados.filter(([, i]) => i < 0).map(([, , nome]) => nome)
  return faltam.length ? { faltam } : (Object.fromEntries(achados.map(([campo, i]) => [campo, i])) as Record<keyof C, number>)
}
