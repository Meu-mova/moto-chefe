// Seletor de empresa em blocos por Conta (#517, ADR-0019): os grupos da própria Conta
// primeiro; os liberados de outras Contas depois, com a Conta dona ao lado. Regra pura.

export type GrupoDoSeletor = { id: string; nome: string; cor: string | null; contaId: string; contaNome: string }

export type BlocoDoSeletor = { titulo: string | null; grupos: (GrupoDoSeletor & { mostrarConta: boolean })[] }

/** Sem grupo de outra Conta (ou sem Conta de origem, como o admin_geral): um bloco só, sem título. */
export function blocosDoSeletor(grupos: GrupoDoSeletor[], contaDeOrigem: string | null): BlocoDoSeletor[] {
  const minha = grupos.filter(g => g.contaId === contaDeOrigem)
  const outras = grupos.filter(g => g.contaId !== contaDeOrigem)
  if (!contaDeOrigem || !outras.length) return [{ titulo: null, grupos: grupos.map(g => ({ ...g, mostrarConta: false })) }]
  return [
    { titulo: 'Minha Conta', grupos: minha.map(g => ({ ...g, mostrarConta: false })) },
    { titulo: 'Outras Contas', grupos: outras.map(g => ({ ...g, mostrarConta: true })) },
  ]
}
