import type { StatusConc } from './conciliacao-status'

/**
 * A partir desta data o contrato e o checklist passaram a ser enviados por
 * e-mail, e toda venda precisa fechar as quatro etapas. Venda anterior não
 * entra na conta — a regra não existia.
 */
export const INICIO_REGRA_DOCUMENTOS = '2026-08-12'

export type Pendencia = 'contrato' | 'checklist' | 'nf' | 'conciliacao'

export type VendaDocumentos = {
  contratoAssinado: boolean
  checklistAssinado: boolean
  notaFiscalSaida: string | null
  /** Liberação de exceção da trava de NF, dada por admin com motivo registrado. */
  nfLiberadaEm: Date | string | null
  statusConciliacao: StatusConc
}

export const LABEL_PENDENCIA: Record<Pendencia, string> = {
  contrato: 'contrato',
  checklist: 'checklist',
  nf: 'NF',
  conciliacao: 'conciliação',
}

/**
 * O que ainda falta nesta venda, na ordem em que o vendedor resolve.
 *
 * A liberação de NF dispensa os três documentos: é uma decisão consciente de
 * admin, com motivo gravado, e foi o que tirou as vendas de teste do dia 12 da
 * cobrança. A conciliação continua valendo mesmo assim — é dinheiro entrando,
 * não documento, e a liberação não diz nada sobre isso.
 */
export function pendenciasDaVenda(venda: VendaDocumentos): Pendencia[] {
  const pendencias: Pendencia[] = []
  const documentosDispensados = venda.nfLiberadaEm != null

  if (!documentosDispensados) {
    if (!venda.contratoAssinado) pendencias.push('contrato')
    if (!venda.checklistAssinado) pendencias.push('checklist')
    if (!venda.notaFiscalSaida) pendencias.push('nf')
  }
  // 'na' = venda sem cartão nem PIX (dinheiro, financiamento): nada a conciliar.
  if (venda.statusConciliacao === 'pendente' || venda.statusConciliacao === 'parcial') {
    pendencias.push('conciliacao')
  }
  return pendencias
}

export function vendaEfetivada(venda: VendaDocumentos): boolean {
  return pendenciasDaVenda(venda).length === 0
}
