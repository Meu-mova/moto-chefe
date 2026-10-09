/**
 * Classificação dos status da NF de saída: os da Nota Gateway e os nossos
 * (Enviando, Processando). Trava, consulta e tela decidem pela mesma lista.
 * Status oficiais: https://docs.notagateway.com.br/docs/status-da-nota-fiscal-no-gateway
 */

/**
 * Só estes liberam nova emissão. A trava (índice da 0111 e checagem antes de
 * emitir) é por exclusão de propósito: status intermediário, ou que a API passe
 * a ter depois, segura a venda em vez de deixar sair uma segunda nota (#80).
 */
export const STATUS_MORTOS = ['Negada', 'Denegada', 'Cancelada']

const STATUS_FINAIS = [...STATUS_MORTOS, 'Autorizada', 'CancelamentoNegado']

/** Final: a nota não muda mais sozinha. Nos demais a tela oferece "Consultar". */
export function ehFinal(status: string): boolean {
  return STATUS_FINAIS.includes(status)
}

/** A SEFAZ não autorizou a nota. */
export function ehRecusada(status: string): boolean {
  return status === 'Negada' || status === 'Denegada'
}

/**
 * O statusSefaz só serve de motivo à nota recusada: na nota cancelada do teste no
 * staging (09/10/2026), ele veio "100 - Autorizado o uso da NF-e".
 */
export function motivoDoStatus(n: { status: string; motivoStatus: string | null; statusSefaz: string | null }): string | null {
  return n.motivoStatus ?? (ehRecusada(n.status) ? n.statusSefaz : null)
}

/** Regra geral da SEFAZ: 24h contadas da autorização; depois disso ela recusa com 220. */
const PRAZO_CANCELAMENTO_MS = 24 * 60 * 60 * 1000

const EM_CANCELAMENTO = ['SolicitandoCancelamento', 'CancelamentoSolicitado', 'EmProcessoDeCancelamento', 'CanceladaAguardandoAtualizacaoPDF']

/** Cancelamento pedido, à espera da SEFAZ. */
export function emCancelamento(status: string): boolean {
  return EM_CANCELAMENTO.includes(status)
}

/**
 * Fim de um pedido de cancelamento. Logo depois do pedido, a consulta ainda pode
 * devolver o estado de antes: a Autorizada, ou a recusa do pedido anterior, que
 * só conta se a Nota Gateway alterou a nota depois do pedido. Sem essa data, a
 * recusa de um "Tentar de novo" só aparece no fim das consultas.
 */
export function cancelamentoConcluido(
  n: { status: string; dataUltimaAlteracao: string | null },
  pedido: { statusAntes: string; em: Date },
): boolean {
  if (n.status === 'Cancelada') return true
  if (n.status !== 'CancelamentoNegado') return false
  return pedido.statusAntes !== 'CancelamentoNegado' || (!!n.dataUltimaAlteracao && new Date(n.dataUltimaAlteracao) >= pedido.em)
}

export type SituacaoCancelamento = 'disponivel' | 'fora_do_prazo' | 'em_andamento' | 'indisponivel' | 'sem_data'

/**
 * Só nota autorizada (ou com cancelamento negado) cancela. Pedir o cancelamento
 * de uma negada também volta "Cancelada" da API, mas é cancelamento lógico,
 * sem nada na SEFAZ.
 */
export function situacaoCancelamento(nota: { status: string; dataAutorizacao: string | null }, agora: Date): SituacaoCancelamento {
  if (emCancelamento(nota.status)) return 'em_andamento'
  if (nota.status !== 'Autorizada' && nota.status !== 'CancelamentoNegado') return 'indisponivel'
  if (!nota.dataAutorizacao) return 'sem_data'
  return agora < limiteCancelamento(nota.dataAutorizacao) ? 'disponivel' : 'fora_do_prazo'
}

export function limiteCancelamento(dataAutorizacao: string): Date {
  return new Date(new Date(dataAutorizacao).getTime() + PRAZO_CANCELAMENTO_MS)
}

/**
 * Só a nota que valeu na SEFAZ desfaz o faturamento: sem data de autorização,
 * "Cancelada" é o cancelamento lógico de uma negada. Homologação nunca faturou.
 */
export function deveDesfazerFaturamento(nota: { status: string; ambiente: string; dataAutorizacao: string | null }): boolean {
  return nota.status === 'Cancelada' && nota.ambiente === 'Producao' && !!nota.dataAutorizacao
}
