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
