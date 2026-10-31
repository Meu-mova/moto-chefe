// Grupos que o formulário de /admin/usuarios oferece em "Aprovação de venda" e "Empresas que
// este usuário enxerga": só os da Conta da loja escolhida (ADR-0018). Grupo de outra Conta só
// vai pelo bloco "Grupos de outras Contas" do admin_rede (ADR-0019). Regra pura.

type GrupoForm = { id: string; contaId: string }
type LojaForm = { id: string; grupoId: string }
type Inicial = { lojaId?: string | null; grupoDaLojaId?: string | null; contaId?: string | null } | undefined

/** Conta do usuário no formulário; null quando não dá para saber (aí a tela mostra todos e o servidor confere). */
export function contaDoFormulario(lojaId: string, lojas: LojaForm[], grupos: GrupoForm[], gruposAcesso: string[], inicial: Inicial): string | null {
  const contaDoGrupo = (g: string | null | undefined) => (g ? grupos.find(x => x.id === g)?.contaId ?? null : null)
  if (lojaId) {
    // A loja atual do usuário pode não estar na lista (o admin_geral vê só as lojas do grupo ativo).
    const grupo = lojas.find(l => l.id === lojaId)?.grupoId ?? (lojaId === inicial?.lojaId ? inicial.grupoDaLojaId : null)
    return contaDoGrupo(grupo) ?? (lojaId === inicial?.lojaId ? inicial?.contaId ?? null : null)
  }
  // Sócio sem loja: a Conta vem do primeiro grupo de acesso, como no servidor (contaDoUsuario).
  return contaDoGrupo(gruposAcesso[0]) ?? inicial?.contaId ?? null
}

export function gruposDaConta<G extends GrupoForm>(grupos: G[], contaId: string | null): G[] {
  return contaId ? grupos.filter(g => g.contaId === contaId) : grupos
}
