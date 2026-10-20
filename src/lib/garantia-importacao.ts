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

// Situações do portal em que a garantia ainda está andando (filtro "status" de
// /clientes/trocas, lido em 19/10/2026). Encerradas: Cancelado, Entregue, Garantia
// concluída e Retirado. Situação nova fica de fora até entrar aqui: importar uma
// encerrada poria moto vendida de volta em "em garantia".
const EM_ANDAMENTO = new Set([
  'aguardando devolucao', 'aguardando postagem reversa', 'aguardando reposicao', 'aguardando separacao',
  'em auditoria', 'em avaliacao do tecnico', 'em avaliacao sac', 'em conferencia', 'em exigencia',
  'em separacao', 'pedido enviado', 'separado',
])

function normalizarSituacao(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** A garantia do portal ainda está andando? Só essas entram na importação. */
export function garantiaEmAndamento(situacao: string | null | undefined): boolean {
  return !!situacao && EM_ANDAMENTO.has(normalizarSituacao(situacao))
}
