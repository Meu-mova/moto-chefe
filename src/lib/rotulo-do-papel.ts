const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  cargo: 'Cargo da Conta',
  admin_socio: 'Admin Sócio',
  admin_rede: 'Admin de Rede',
  aux_adm: 'Aux. Administrativo',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
}

/** O que o rodapé do menu mostra sob o nome: o cargo, se tem, senão o papel gravado. */
export function rotuloDoPapel(usuario: { papel: string; cargoNome?: string | null }): string {
  return usuario.cargoNome ?? PAPEL_LABEL[usuario.papel] ?? usuario.papel
}
