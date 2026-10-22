// ─── Quem gerencia quais usuários (#322, adendo ao ADR-0018) ──────────────────
// Regra pura, sem banco nem sessão. As actions de /admin/usuarios montam o gestor
// (grupos que ele vê, de @/lib/acesso-grupo) e o alvo, e recusam o que daqui vier.
//
// O sócio gerencia só quem é de loja de grupo que ele vê, não a Conta inteira:
// sócio marcado só num grupo não mexe em quem trabalha em outro (adendo #193).

export type Gestor = { id: string; papel: string; gruposVisiveis: string[] }
export type AlvoGestao = { papel: string; grupoDaLoja: string | null }

export function podeGerenciar(gestor: Gestor, alvo: AlvoGestao): boolean {
  if (gestor.papel === 'admin_geral') return true
  if (gestor.papel !== 'admin_socio') return false
  return alvo.grupoDaLoja !== null && gestor.gruposVisiveis.includes(alvo.grupoDaLoja)
}

export type CadastroGestao = AlvoGestao & {
  gruposAcesso: string[]
  gruposAprovacao: string[]
  modulosExtras: string[]
  ativo: boolean
}

/** Mensagem de recusa, ou null se o gestor pode gravar. `antes` null = criação. */
export function recusaDaGravacao(
  gestor: Gestor & { itensLiberaveis: string[] },
  antes: (CadastroGestao & { id: string }) | null,
  depois: CadastroGestao,
): string | null {
  if (gestor.papel === 'admin_geral') return null
  if (gestor.papel !== 'admin_socio') return 'Sem permissão para gerenciar usuários'
  if (antes && !podeGerenciar(gestor, antes)) return 'Usuário fora do seu alcance'
  // Para a Conta não ficar sem sócio.
  if (antes?.id === gestor.id && (depois.papel !== antes.papel || !depois.ativo)) {
    return 'Você não pode desativar nem trocar o papel de si mesmo'
  }
  if (depois.papel === 'admin_geral') return 'Só o Admin Geral dá o papel Admin Geral'
  // Sem loja, o usuário sairia do alcance do próprio sócio que o criou.
  if (depois.grupoDaLoja === null) return 'Escolha a loja do usuário'
  // Só o que o sócio acrescenta passa pelo limite: o que o admin_geral já deu ao
  // usuário fica, senão o sócio não conseguiria nem corrigir o nome dele.
  const novos = (ids: string[], deAntes: string[] = []) => ids.filter(id => !deAntes.includes(id))
  const vê = (g: string) => gestor.gruposVisiveis.includes(g)
  const gruposNovos = [
    ...novos([depois.grupoDaLoja], antes?.grupoDaLoja ? [antes.grupoDaLoja] : []),
    ...novos(depois.gruposAcesso, antes?.gruposAcesso),
    ...novos(depois.gruposAprovacao, antes?.gruposAprovacao),
  ]
  if (!gruposNovos.every(vê)) {
    return 'Você só pode usar lojas e grupos que você mesmo vê'
  }
  if (!novos(depois.modulosExtras, antes?.modulosExtras).every(id => gestor.itensLiberaveis.includes(id))) {
    return 'Você só pode liberar telas que você mesmo tem'
  }
  return null
}

// Excluir apaga o login e esbarra no histórico (vendas, OS) que aponta para o usuário.
export function podeExcluir(gestor: { papel: string }): boolean {
  return gestor.papel === 'admin_geral'
}
