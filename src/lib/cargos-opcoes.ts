import type { PapelBase } from '@/lib/gestao-usuarios'

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
