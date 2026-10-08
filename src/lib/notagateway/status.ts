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
