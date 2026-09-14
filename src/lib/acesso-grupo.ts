// ─── Posse de grupo (multi-tenant) ─────────────────────────────────────────────
// Regra pura de QUAL GRUPO o usuário pode enxergar/escolher — sem banco nem
// next/headers, para ser testável isoladamente. Quem resolve com banco e aplica
// no cookie é @/lib/grupo (getGrupoAtivo) e a action de troca de grupo em
// @/components/layout/group-selector-actions.
//
// Por que existe: antes desta trava, getGrupoAtivo() aceitava qualquer grupo id
// vindo do cookie `grupoAtivo` desde que o grupo existisse e estivesse ativo —
// nunca checava se o usuário tinha posse dele. Como quase toda página e action
// usa o grupo ativo como prova de escopo multi-tenant, isso deixava qualquer
// admin_socio trocar para o CNPJ de outro lojista sem forjar nada.
//
// É a coluna usuarios.grupos_acesso, DIFERENTE de usuarios.grupos_aprovacao
// (@/lib/aprovacao-permissao): aprovar pagamento num grupo e enxergar aquele
// grupo inteiro são coisas diferentes — não reaproveitar uma trava pela outra
// é proposital.

export type UsuarioAcessoGrupo = {
  papel: string
  gruposAcesso?: string[] | null
}

// admin_geral é o dono do sistema e a válvula de segurança: precisa sobrar
// alguém que consiga entrar em qualquer grupo e consertar se esta trava tiver
// defeito. Mesmo princípio da trava de /completar-cadastro no layout do
// dashboard, que também deixa admin_geral de fora de propósito.
function ehAdminGeral(usuario: { papel: string }): boolean {
  return usuario.papel === 'admin_geral'
}

// Lista de grupos que o usuário pode escolher no seletor de empresa / ter como
// grupoAtivo, já filtrada pelos grupos ativos existentes.
//
// - admin_geral: todos.
// - lista vazia (usuarios.grupos_acesso = '{}', o padrão de hoje): só o grupo
//   da própria loja — é o comportamento atual de vendedor/mecânico/aux_adm, e
//   não pode mudar para eles.
// - lista preenchida: exatamente aqueles grupos MAIS o da própria loja —
//   ninguém perde acesso à empresa onde trabalha por causa desta lista.
//
// `grupoDaPropriaLoja` pode ser null (usuário sem loja, ex.: cadastro
// incompleto) — sem loja e sem lista, a função não deve explodir, só devolve
// lista vazia.
export function gruposVisiveis(
  usuario: UsuarioAcessoGrupo,
  grupoDaPropriaLoja: string | null,
  todosOsGruposAtivos: string[],
): string[] {
  if (ehAdminGeral(usuario)) return todosOsGruposAtivos

  const permitidos = new Set(usuario.gruposAcesso ?? [])
  if (grupoDaPropriaLoja) permitidos.add(grupoDaPropriaLoja)

  return todosOsGruposAtivos.filter(g => permitidos.has(g))
}

// Mesma regra que gruposVisiveis, mas para checar um grupo específico sem
// precisar carregar a lista inteira de grupos ativos (uso em getGrupoAtivo,
// que já tem o grupo do cookie em mãos e só precisa saber se vale).
export function podeVerGrupo(
  usuario: UsuarioAcessoGrupo,
  grupoDaPropriaLoja: string | null,
  grupoId: string,
): boolean {
  if (ehAdminGeral(usuario)) return true
  if (grupoDaPropriaLoja && grupoId === grupoDaPropriaLoja) return true
  return (usuario.gruposAcesso ?? []).includes(grupoId)
}
