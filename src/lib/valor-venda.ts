/** Quem pode mudar o valor total no "Editar venda". O aux_adm edita os pagamentos, nunca o valor (#293). */
const PAPEIS_QUE_ALTERAM_VALOR: ReadonlySet<string> = new Set(['admin_geral', 'admin_socio'])

export function podeAlterarValorVenda(papel: string): boolean {
  return PAPEIS_QUE_ALTERAM_VALOR.has(papel)
}

/** A recusa da edição por mudança de valor (#293), ou null se o papel pode ou o valor não mudou. */
export function travaDoValorVenda(papel: string, valorGravado: number, valorEnviado: number): string | null {
  if (podeAlterarValorVenda(papel) || Math.abs(valorGravado - valorEnviado) < 0.005) return null
  return 'O valor da venda só pode ser alterado pelos administradores.'
}
