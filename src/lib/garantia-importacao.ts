// Regras puras da importação de garantias do portal da fábrica
// (importarGarantiasFabricaAction). Ficam aqui pra o teste cobrir sem banco.

/**
 * "#38780" e "38780" são o mesmo pedido: a importação grava só os dígitos, mas
 * quem lança à mão costuma copiar com o "#". Sem normalizar, a varredura
 * completa duplicaria toda garantia lançada à mão.
 */
export function normalizarNumeroPedido(numero: string | null | undefined): string {
  return (numero ?? '').replace(/\D/g, '')
}

// Abaixo disso o final do chassi casa com moto demais pra servir de chave.
export const MIN_DIGITOS_SUFIXO_CHASSI = 4

type MotoCandidata = { id: string; lojaId: string; chassi: string }

function limparChassi(chassi: string): string {
  return chassi.replace(/\s+/g, '').toUpperCase()
}

/**
 * Acha a moto do chassi digitado no portal.
 *
 * O portal aceita o que a loja digitar, e às vezes vem só o final ("3024",
 * "5122"). Primeiro vale o chassi exato; senão, o final do chassi — mas só se
 * exatamente uma moto terminar assim. Duas ou mais é ambíguo e a garantia fica
 * de fora: abrir garantia na moto errada a tira do estoque disponível.
 */
export function escolherMotoPorChassi<T extends MotoCandidata>(
  chassiPortal: string,
  candidatas: T[],
): T | null {
  const alvo = limparChassi(chassiPortal)
  if (!alvo) return null

  const exata = candidatas.find(m => limparChassi(m.chassi) === alvo)
  if (exata) return exata

  if (alvo.length < MIN_DIGITOS_SUFIXO_CHASSI) return null
  const porFinal = candidatas.filter(m => limparChassi(m.chassi).endsWith(alvo))
  return porFinal.length === 1 ? porFinal[0] : null
}
