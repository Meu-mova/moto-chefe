// ─── Regras puras de quem aprova venda ────────────────────────────────────────
// A resolução dos grupos (qual grupo é a loja da venda, qual é a loja do
// aprovador) exige banco e fica em @/lib/grupo. Aqui mora só a REGRA, sem banco
// nem next/headers, para poder ser testada isoladamente.

// Único usuário que opera os dois grupos (Sul de Minas + BH) por decisão
// histórica, sem passar pelo cadastro. Mesma exceção de podeTransferirEntreGrupos.
// Para qualquer outra pessoa use os campos de /admin/usuarios (grupos_aprovacao
// e aprova_pagamento_sensivel) em vez de acrescentar e-mail aqui.
export const EMAIL_ACESSO_MULTI_GRUPO = 'cesar.rodrigues@motochefesuldeminas.com.br'

// Só admin aprova. Os campos de aprovação existem no cadastro de qualquer
// usuário, mas não valem nada para vendedor/mecânico/aux_adm.
const PAPEIS_APROVADORES = ['admin_geral', 'admin_socio']

export type UsuarioAprovador = {
  papel: string
  email: string
  lojaId: string | null
  gruposAprovacao?: string[] | null
  aprovaPagamentoSensivel?: boolean | null
}

// Quem aprova venda de baixo valor em QUALQUER grupo, sem depender da loja fixa:
//   - admin_geral: aprova tudo, sempre.
//   - usuário multi-grupo: opera os dois grupos, então aprova nos dois. Sem
//     isto ele só aprovaria no grupo da própria loja (Sul de Minas) e ficaria
//     travado no BH — que é o bug que esta função corrige.
export function aprovaBaixoValorEmQualquerGrupo(usuario: { papel: string; email: string }): boolean {
  return usuario.papel === 'admin_geral' || usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

// admin_socio comum aprova no próprio grupo — o da loja fixa dele
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

// Grupos liberados no cadastro, ALÉM do grupo da loja fixa. É por aqui que um
// sócio de um grupo aprova no outro sem precisar de deploy (ex.: João Brito,
// loja em Itajubá/Sul de Minas, liberado também no BH e no Vale).
export function aprovaEmGrupoExtra(usuario: UsuarioAprovador, grupoAlvo: string): boolean {
  if (!PAPEIS_APROVADORES.includes(usuario.papel)) return false
  return (usuario.gruposAprovacao ?? []).includes(grupoAlvo)
}

// Financiamento/transferência: além de precisar da liberação explícita
// (aprova_pagamento_sensivel), respeita o mesmo escopo de grupo do baixo valor —
// grupo da própria loja + grupos extras. admin_geral NÃO entra por papel: ver
// esse dado é liberação nominal, não atributo do cargo.
export function aprovaPagamentoSensivelNoGrupo(
  usuario: UsuarioAprovador,
  grupoAlvo: string,
  grupoDaLojaDoUsuario: string | null,
): boolean {
  if (usuario.email === EMAIL_ACESSO_MULTI_GRUPO) return true
  if (!usuario.aprovaPagamentoSensivel) return false
  if (!PAPEIS_APROVADORES.includes(usuario.papel)) return false
  if (grupoDaLojaDoUsuario && grupoAlvo === grupoDaLojaDoUsuario) return true
  return (usuario.gruposAprovacao ?? []).includes(grupoAlvo)
}
