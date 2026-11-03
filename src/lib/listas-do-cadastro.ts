// Quais listas do cadastro (aprovação e acesso a grupos) valem para um usuário (#617). Tela e
// servidor decidem por aqui. Quem tem cargo faz o que a base faz (ADR-0018). Papel gravado, não a
// sessão: o admin_rede ainda é admin_rede.

const COM_APROVACAO = ['admin_geral', 'admin_rede', 'admin_socio']
const COM_ACESSO_A_GRUPOS = ['admin_socio', 'admin_rede']

/** Papel que governa as listas: a base do cargo, ou o próprio papel. */
export function papelDasListas(papel: string, papelBaseDoCargo: string | null): string {
  return papel === 'cargo' && papelBaseDoCargo ? papelBaseDoCargo : papel
}

export function guardaAprovacao(papel: string): boolean {
  return COM_APROVACAO.includes(papel)
}

export function guardaAcessoAGrupos(papel: string): boolean {
  return COM_ACESSO_A_GRUPOS.includes(papel)
}
