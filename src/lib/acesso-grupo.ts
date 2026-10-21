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
  // Conta de origem (ADR-0018). Grupo de outra Conta nunca aparece, nem marcado em
  // grupos_acesso; sem Conta, nenhum grupo (só admin_geral vive sem Conta).
  contaId?: string | null
}

export type GrupoComConta = { id: string; contaId: string }

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
  todosOsGruposAtivos: GrupoComConta[],
): string[] {
  return todosOsGruposAtivos.filter(g => podeVerGrupo(usuario, grupoDaPropriaLoja, g)).map(g => g.id)
}

// Mesma regra que gruposVisiveis, mas para checar um grupo específico sem
// precisar carregar a lista inteira de grupos ativos (uso em getGrupoAtivo,
// que já tem o grupo do cookie em mãos e só precisa saber se vale).
export function podeVerGrupo(
  usuario: UsuarioAcessoGrupo,
  grupoDaPropriaLoja: string | null,
  grupo: GrupoComConta,
): boolean {
  if (ehAdminGeral(usuario)) return true
  if (!usuario.contaId || grupo.contaId !== usuario.contaId) return false
  if (grupoDaPropriaLoja && grupo.id === grupoDaPropriaLoja) return true
  return (usuario.gruposAcesso ?? []).includes(grupo.id)
}

// ─── Escolha do grupo padrão (fallback de getGrupoAtivo) ──────────────────────
// Usada quando o cookie `grupoAtivo` não serve (ausente, de um grupo
// inexistente/inativo, ou de um grupo sem posse): getGrupoAtivo precisa
// escolher UM grupo sozinho para a página não quebrar.
//
// FALHA FECHADO de propósito: recebe só os grupos já filtrados por
// podeVerGrupo/gruposVisiveis (a lista PERMITIDA), nunca a lista de todos os
// grupos ativos. Se vier vazia — usuário sem loja e sem grupos_acesso, que
// existe neste banco (admin_socio sem loja fixa) — lança erro em vez de
// devolver um grupo à toa.
//
// Bug que isto corrige: a versão anterior, ao ver a lista de permitidos
// vazia, caía de volta para TODOS os grupos ativos e devolvia o primeiro
// (Sul de Minas por padrão) — servindo dado de um tenant que o usuário nunca
// deveria ver, em silêncio, sem erro e sem aparecer no seletor.
export function escolherGrupoPadrao<T extends { id: string }>(
  permitidos: T[],
  grupoPadraoId: string,
): T {
  if (!permitidos.length) {
    throw new Error(
      'Usuário sem nenhum grupo permitido (sem loja e sem grupos_acesso cadastrados) — não há grupo padrão a escolher.',
    )
  }
  return permitidos.find(g => g.id === grupoPadraoId) ?? permitidos[0]
}
