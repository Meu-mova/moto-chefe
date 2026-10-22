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
