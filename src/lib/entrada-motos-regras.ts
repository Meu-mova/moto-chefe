// Regras puras da Entrada de motos (#691): a mesma conferência para a nota, a planilha e o XML.
import { chaveDoChassi } from './entrada-lista'
import type { MotoConferida, MotoEntradaLote } from './entrada-motos'

/**
 * Separa as motos que podem ser gravadas das que não podem, na ordem da lista: chassi vazio é
 * ignorado; chassi repetido, modelo que a Conta da loja não usa e preço vazio viram recusa.
 */
export function separarMotosDaEntrada(motos: readonly MotoEntradaLote[], modelosValidos: ReadonlySet<string>): { prontas: MotoConferida[]; erros: string[] } {
  const { prontas, erros } = motos.reduce<{ prontas: MotoConferida[]; erros: string[]; vistos: ReadonlySet<string> }>((acc, moto) => {
    const chassi = chaveDoChassi(moto.chassi)
    if (!chassi) return acc
    const precoCompra = (moto.precoCompra || '').replace(',', '.').trim()
    const vistos = new Set([...acc.vistos, chassi])
    const erro = acc.vistos.has(chassi) ? 'chassi repetido na nota'
      : !moto.modeloId || !modelosValidos.has(moto.modeloId) ? 'selecione o modelo antes de registrar'
        : !precoCompra ? 'informe o preço de compra'
          : null
    return erro
      ? { ...acc, vistos, erros: [...acc.erros, `${chassi}: ${erro}`] }
      : { ...acc, vistos, prontas: [...acc.prontas, { chassi, moto, precoCompra }] }
  }, { prontas: [], erros: [], vistos: new Set() })
  return { prontas, erros }
}
