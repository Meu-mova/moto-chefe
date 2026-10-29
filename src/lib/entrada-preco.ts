/**
 * Casamento do nome que veio do XML de NF-e ou da planilha com o cadastro de modelos, e o
 * preço de compra que a tela já traz preenchido (#513), sempre editável.
 *
 * De onde vem o preço, nesta ordem: o do próprio arquivo (vUnCom do item da nota, coluna
 * PREÇO da planilha) e, sem ele, o padrão do modelo na Conta da loja de destino
 * (`precosPadraoDaLoja`). Nunca o padrão da plataforma nem o último preço usado: seriam o
 * preço combinado por outra Conta (#288).
 */

export type ModeloSugestao = { id: string; modelo: string }

export const normalizarNomeModelo = (s: string) =>
  s.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

/** Id do modelo cadastrado com o mesmo nome, ou '' para a pessoa escolher na tela. */
export function casarModelo(nomeDoArquivo: string, modelos: ModeloSugestao[]): string {
  const alvo = normalizarNomeModelo(nomeDoArquivo)
  return modelos.find(m => normalizarNomeModelo(m.modelo) === alvo)?.id ?? ''
}

/** Valor da coluna PREÇO no formato do campo de moeda ('2016.38'), ou '' se não servir. */
export function precoDaPlanilha(valor: unknown): string {
  let n: number
  if (typeof valor === 'number') n = valor
  else if (typeof valor === 'string') {
    let t = valor.replace(/[^\d.,-]/g, '')
    // Com vírgula, ela é a decimal e o ponto é milhar. Sem vírgula, ponto seguido de
    // 3 dígitos é milhar ("6.400"); com 1 ou 2, é decimal ("2016.38").
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
    n = t ? Number(t) : NaN
  } else return ''
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : ''
}

/** Preço que a linha abre preenchido: o do arquivo, senão o padrão do modelo na Conta. */
export function precoSugerido(doArquivo: string, modeloId: string, padroes: Record<string, string>): string {
  return doArquivo || (modeloId && padroes[modeloId]) || ''
}
