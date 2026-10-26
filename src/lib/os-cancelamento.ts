/**
 * Regra única de quem pode cancelar uma OS e do que impede o cancelamento.
 *
 * Fica fora da action de propósito: a página precisa da mesma resposta para
 * decidir se mostra o botão, e quando a regra existia duplicada nos dois lugares
 * elas divergiram (a action liberava um conjunto de papéis, a tela outro).
 */

/** Cancelar é ato administrativo — inclui o aux_adm, que abre e fecha OS no dia a dia. */
export const PAPEIS_CANCELAM_OS = ['admin_geral', 'admin_socio', 'aux_adm'] as const

export function podeCancelarOS(papel: string): boolean {
  return (PAPEIS_CANCELAM_OS as readonly string[]).includes(papel)
}

export type SituacaoOS = {
  jaCancelada: boolean
  /** Pagamento aplicado na OS (forma de pagamento, lista de pagamentos ou status concluída). */
  temPagamento: boolean
  /** Conciliação de cartão ou PIX amarrado nesta OS. */
  temConciliacao: boolean
  temAprovacaoPendente: boolean
}

/**
 * Motivo pelo qual esta OS não pode ser cancelada, ou null se pode.
 * O texto é o mesmo mostrado na tela e devolvido pela action.
 */
export function motivoBloqueioCancelamento(s: SituacaoOS): string | null {
  if (s.jaCancelada)          return 'Esta OS já está cancelada'
  if (s.temConciliacao)       return 'OS já conciliada não pode ser cancelada'
  if (s.temPagamento)         return 'OS com pagamento lançado não pode ser cancelada: não há estorno de caixa'
  if (s.temAprovacaoPendente) return 'Existe uma aprovação de pagamento pendente para esta OS. Resolva antes de cancelar'
  return null
}
