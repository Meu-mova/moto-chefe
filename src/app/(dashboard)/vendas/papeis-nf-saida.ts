// Em arquivo próprio, e não em `nfe-propria-actions.ts`: lá o 'use server' só
// deixa exportar função async. A tela e as actions leem a mesma lista, como em
// `pecas/papeis.ts` (uma cópia desalinhada já derrubou a página de Peças).

/** Emite, consulta e cancela NF de saída. aux_adm entra: é quem opera a loja. */
const PAPEIS_NF_SAIDA = ['admin_geral', 'admin_socio', 'aux_adm'] as const

export function podeOperarNfSaida(papel: string): boolean {
  return (PAPEIS_NF_SAIDA as readonly string[]).includes(papel)
}

/** Grava a configuração fiscal do grupo (Admin → Notas fiscais): só sócios. */
const PAPEIS_CONFIG_FISCAL = ['admin_geral', 'admin_socio'] as const

export function podeConfigurarFiscal(papel: string): boolean {
  return (PAPEIS_CONFIG_FISCAL as readonly string[]).includes(papel)
}
