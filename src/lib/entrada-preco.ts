/**
 * Casamento do nome que veio do XML de NF-e ou da planilha com o cadastro de modelos.
 *
 * O preço de compra não é sugerido: quem define é o cliente (#288). O cadastro de
 * modelos é da plataforma, e o último preço de qualquer grupo seria o preço
 * combinado por outra Conta.
 */

export type ModeloSugestao = { id: string; modelo: string }

export const normalizarNomeModelo = (s: string) =>
  s.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

/** Id do modelo cadastrado com o mesmo nome, ou '' para a pessoa escolher na tela. */
export function casarModelo(nomeDoArquivo: string, modelos: ModeloSugestao[]): string {
  const alvo = normalizarNomeModelo(nomeDoArquivo)
  return modelos.find(m => normalizarNomeModelo(m.modelo) === alvo)?.id ?? ''
}
