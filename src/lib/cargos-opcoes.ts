/**
 * Cargos que o select do usuário oferece (#450): os da Conta dele. O admin_geral recebe os
 * de todas as Contas e edita usuário de qualquer uma; usuário novo nasce na Conta ativa.
 * O servidor confere de novo (cargoParaGravar).
 */
export function cargosDoAlvo<C extends { contaId: string }>(cargos: C[], contaDoAlvo: string | null, contaAtiva: string): C[] {
  const conta = contaDoAlvo ?? contaAtiva
  return cargos.filter(c => c.contaId === conta)
}
