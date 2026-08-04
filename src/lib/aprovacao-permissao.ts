// ─── Regra pura de quem aprova venda de baixo valor ───────────────────────────
// A resolução dos grupos (qual grupo é a loja da venda, qual é a loja do sócio)
// exige banco e fica em @/lib/grupo. Aqui mora só a REGRA, sem banco nem
// next/headers, para poder ser testada isoladamente.

// Único usuário que opera os dois grupos (Sul de Minas + BH). Mesma exceção
// pontual de podeTransferirEntreGrupos / podeAprovarPagamentoSensivel.
export const EMAIL_ACESSO_MULTI_GRUPO = 'cesar.rodrigues@motochefesuldeminas.com.br'

// Quem aprova venda de baixo valor em QUALQUER grupo, sem depender da loja fixa:
//   - admin_geral: aprova tudo, sempre.
//   - usuário multi-grupo: opera os dois grupos, então aprova nos dois. Sem
//     isto ele só aprovaria no grupo da própria loja (Sul de Minas) e ficaria
//     travado no BH — que é o bug que esta função corrige.
export function aprovaBaixoValorEmQualquerGrupo(usuario: { papel: string; email: string }): boolean {
  return usuario.papel === 'admin_geral' || usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

// admin_socio comum aprova só no próprio grupo — o da loja fixa dele
// (usuarios.lojaId), nunca o do cookie grupoAtivo: a permissão de aprovar não
// deve depender de qual grupo ele está "olhando" no momento.
export function socioAprovaNoGrupo(
  usuario: { papel: string; lojaId: string | null },
  grupoVenda: string,
  grupoLojaDoSocio: string,
): boolean {
  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false
  return grupoVenda === grupoLojaDoSocio
}
