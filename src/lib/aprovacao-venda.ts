// Regras de quando uma venda de moto precisa de aprovação. Uma só para a tela e o servidor
// do Vender e da efetivação do pedido (#776), e para o fechamento da OS (pagamento sensível).

// Financiamento saiu daqui em 01/09/2026: a venda financiada é lançada direto e a
// conferência acontece depois, na conciliação, onde o financiamento nasce pendente
// até o admin_geral confirmar que caiu na conta. Ver precisaConciliar em
// @/lib/conciliacao-status. A venda de peça tem a sua lista (pecas/actions.ts).
const TIPOS_PAGAMENTO_SENSIVEL: ReadonlySet<string> = new Set(['transferencia'])

export const ehPagamentoSensivel = (tipo: string) => TIPOS_PAGAMENTO_SENSIVEL.has(tipo)

export const temPagamentoSensivel = (pagamentos: readonly { tipo: string }[]) =>
  pagamentos.some(p => ehPagamentoSensivel(p.tipo))

/** Líquido abaixo do preço mínimo PIX, com 1 centavo de folga para o arredondamento. */
export const abaixoDoMinimo = (liquido: number, minimo: number) => liquido < minimo - 0.01

/** Só sócio e admin geral vendem abaixo do mínimo sem pedir aprovação (auto-aprovação). */
export const podeVenderAbaixoDoMinimo = (papel: string) => ['admin_geral', 'admin_socio'].includes(papel)

export type TipoAprovacaoVenda = 'valor_minimo' | 'pagamento_sensivel'

/**
 * Qual aprovação a venda precisa, ou null para gravar direto. O pagamento sensível vem
 * primeiro: quem aprova a transferência já vê a venda inteira.
 */
export function aprovacaoNecessaria(p: {
  sensivelSemPermissao: boolean
  /** Null sem precificação do modelo: sem mínimo, não há o que aprovar. */
  preco: { liquido: number; minimo: number } | null
  papel: string
}): TipoAprovacaoVenda | null {
  if (p.sensivelSemPermissao) return 'pagamento_sensivel'
  if (p.preco && abaixoDoMinimo(p.preco.liquido, p.preco.minimo) && !podeVenderAbaixoDoMinimo(p.papel)) return 'valor_minimo'
  return null
}
