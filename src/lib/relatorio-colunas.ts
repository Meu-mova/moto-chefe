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

/** Linhas do arquivo, sem o BOM do começo (o Excel grava) e com CRLF ou LF. */
export const linhasDoRelatorio = (texto: string) => texto.replace(/^\uFEFF/, '').split(/\r?\n/)

/**
 * Recusa do cabeçalho que não tem todas as colunas: sem as colunas-chave, o arquivo não é desse
 * relatório (outro arquivo escolhido por engano); com elas, falta uma coluna específica.
 */
export function recusaDoCabecalho(faltam: string[], chaves: string[], relatorio: string, arquivoEsperado: string): string {
  return chaves.some(c => faltam.includes(c))
    ? `Cabeçalho do relatório da ${relatorio} não encontrado. Confira se o arquivo é o ${arquivoEsperado}.`
    : `O relatório da ${relatorio} não tem a coluna: ${faltam.join(', ')}.`
}

/** Valor de uma coluna da linha, pelo nome do campo, sem espaço nas pontas ("" se a linha for curta). */
export type Celula<K extends string> = (campo: K) => string

type Recusa = { erro: string }

/**
 * Lê as linhas depois do cabeçalho, pulando as vazias, com o número da linha no arquivo (1 = 1ª).
 * A primeira linha recusada recusa o arquivo inteiro: a importação não é transacional, e gravar
 * só a parte boa deixaria o relatório pela metade.
 */
export function lerLinhasDoRelatorio<K extends string, L extends object>(
  linhas: string[],
  posCabecalho: number,
  indices: Record<K, number>,
  ler: (celula: Celula<K>, numeroDaLinha: number) => L | Recusa,
): { ok: true; lidas: Exclude<L, Recusa>[] } | { ok: false; erro: string } {
  const lidas = linhas
    .map((linha, pos) => ({ linha, numero: pos + 1 }))
    .slice(posCabecalho + 1)
    .filter(({ linha }) => linha.trim() !== '')
    .map(({ linha, numero }) => {
      const celulas = linha.split(';')
      return ler(campo => (celulas[indices[campo]] ?? '').trim(), numero)
    })
  const recusa = lidas.find((l): l is Recusa => 'erro' in l)
  if (recusa) return { ok: false, erro: recusa.erro }
  return { ok: true, lidas: lidas.filter((l): l is Exclude<L, Recusa> => !('erro' in l)) }
}
