// Papéis do módulo de Peças, em arquivo próprio e não em `actions.ts`: aquele
// arquivo tem 'use server' no topo, e ali todo export precisa ser função async
// — constante não sai de lá. Sem este módulo as listas ficam duplicadas entre a
// página e as actions, e foi exatamente uma cópia desalinhada que derrubou a
// página de Peças para o mecânico: a guarda de rota deixava entrar e a action
// chamada no render barrava.

/** Gere o catálogo: define preço e enxerga os pedidos na fábrica. */
const GESTORES_PECAS = ['admin_geral', 'admin_socio', 'aux_adm'] as const

/** Registra venda de peça. Mecânico fica de fora — ele só consulta o catálogo. */
export const PAPEIS_VENDA_PECA = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'] as const

export function podeGerirPecas(papel: string): boolean {
  return (GESTORES_PECAS as readonly string[]).includes(papel)
}

export function podeVenderPeca(papel: string): boolean {
  return (PAPEIS_VENDA_PECA as readonly string[]).includes(papel)
}

const ADMINS_ESTOQUE = ['admin_geral', 'admin_socio'] as const

/**
 * Loja cujo estoque o usuário vê e ajusta (#195). Usuário de loja: sempre a própria.
 * Admin: a pedida, se estiver entre as `permitidas` (lojas do grupo ativo); sem pedido,
 * a própria ou a primeira permitida. Pedido fora das permitidas não vira loja nenhuma.
 */
export function lojaDoEstoque(
  usuario: { papel: string; lojaId: string | null },
  permitidas: readonly string[],
  pedida?: string | null,
): string | null {
  if (!(ADMINS_ESTOQUE as readonly string[]).includes(usuario.papel)) return usuario.lojaId
  if (pedida) return permitidas.includes(pedida) ? pedida : null
  return usuario.lojaId && permitidas.includes(usuario.lojaId) ? usuario.lojaId : (permitidas[0] ?? null)
}

/** Estoque é em unidades inteiras (decisão do Luis, 27/10/2026). `null` = aceito. */
export function recusaDoEstoque(quantidade: number): string | null {
  if (!Number.isInteger(quantidade)) return 'Estoque é em unidades inteiras, sem vírgula'
  if (quantidade < 0) return 'Estoque não pode ser negativo'
  return null
}
