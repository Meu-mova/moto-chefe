/** Quem vê e pode usar o "Cancelar venda" (#191); a NF ainda pode recusar, ver travaDoPapel. */
export const PAPEIS_QUE_CANCELAM_VENDA: ReadonlySet<string> = new Set(['admin_geral', 'admin_socio', 'aux_adm'])

/** A recusa do "Cancelar venda" que depende do papel (#191), ou null se o papel não trava. */
export function travaDoPapel(papel: string, notaFiscalSaida: string | null): string | null {
  if (papel === 'aux_adm' && notaFiscalSaida) {
    return `Esta venda tem NF registrada (nº ${notaFiscalSaida}). Cancelar venda com nota fiscal fica com os administradores; fale com o Cesar.`
  }
  return null
}
