/**
 * Papéis que um cargo pode ter como base (#616): os que um gestor já dá a um usuário. O banco
 * confere o mesmo conjunto em cargos_papel_base_check (migração 0171).
 */
export const PAPEIS_BASE_DO_CARGO = ['admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista'] as const
export type PapelBase = (typeof PAPEIS_BASE_DO_CARGO)[number]

/** Como a tela de cargos chama cada base (o rótulo do papel fixo, na tela de usuários, é outro). */
export const ROTULO_DA_BASE: Record<PapelBase, string> = {
  admin_socio: 'Sócio',
  aux_adm: 'Adm. da loja',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
}

/**
 * Cargos que o select do usuário oferece (#450): os da Conta dele. O admin_geral recebe os
 * de todas as Contas e edita usuário de qualquer uma; usuário novo nasce na Conta ativa.
 * O servidor confere de novo (cargoParaGravar).
 */
export function cargosDoAlvo<C extends { contaId: string }>(cargos: C[], contaDoAlvo: string | null, contaAtiva: string): C[] {
  const conta = contaDoAlvo ?? contaAtiva
  return cargos.filter(c => c.contaId === conta)
}
