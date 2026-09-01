// Papéis do módulo de Cupons em arquivo próprio, e não em `actions.ts`: aquele
// arquivo tem 'use server' no topo, onde todo export precisa ser função async —
// constante não sai de lá. Mesma lição do módulo de Peças.

/** Emite e cancela cupom. aux_adm entra: é quem opera a loja no dia a dia. */
const GESTORES_CUPOM = ['admin_geral', 'admin_socio', 'aux_adm'] as const

/** Consulta a lista e resgata na OS. Mecânico vê para conferir no balcão. */
const PAPEIS_VEEM_CUPOM = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico'] as const

export function podeEmitirCupom(papel: string): boolean {
  return (GESTORES_CUPOM as readonly string[]).includes(papel)
}

export function podeVerCupom(papel: string): boolean {
  return (PAPEIS_VEEM_CUPOM as readonly string[]).includes(papel)
}
