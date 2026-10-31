// Seletor de empresa em blocos por Conta (#517, ADR-0019). Regra pura: recebe só os grupos
// que o usuário já pode ver (listarGruposVisiveis) e decide títulos, busca e iniciais.

export type GrupoDoSeletor = {
  id: string; nome: string; cor: string | null; contaId: string; contaNome: string
  cidade: string | null; cnpj: string
  /** Lojas do grupo: a pessoa pensa na loja ("Varginha"), não no grupo. */
  lojas: string[]
}

export type BlocoDoSeletor = { titulo: string | null; grupos: (GrupoDoSeletor & { mostrarConta: boolean })[] }

/**
 * admin_geral (sem Conta de origem): um bloco por Conta. Quem tem grupo de outra Conta
 * (admin_rede): "Sua conta" e "Acesso concedido". Os demais: um bloco só, sem título.
 */
export function blocosDoSeletor(grupos: GrupoDoSeletor[], contaDeOrigem: string | null): BlocoDoSeletor[] {
  if (!contaDeOrigem) {
    const porConta = new Map<string, GrupoDoSeletor[]>()
    for (const g of grupos) porConta.set(g.contaId, [...(porConta.get(g.contaId) ?? []), g])
    return [...porConta.values()]
      .sort((a, b) => a[0].contaNome.localeCompare(b[0].contaNome, 'pt-BR'))
      // Toda Conta leva título, mesmo com o nome igual ao do grupo: sem ele, a linha parece
      // ser da Conta de cima.
      .map(gs => ({ titulo: gs[0].contaNome || null, grupos: gs.map(g => ({ ...g, mostrarConta: false })) }))
  }
  const minha = grupos.filter(g => g.contaId === contaDeOrigem)
  const outras = grupos.filter(g => g.contaId !== contaDeOrigem)
  if (!outras.length) return [{ titulo: null, grupos: grupos.map(g => ({ ...g, mostrarConta: false })) }]
  return [
    { titulo: 'Sua conta', grupos: minha.map(g => ({ ...g, mostrarConta: false })) },
    { titulo: 'Acesso concedido', grupos: outras.map(g => ({ ...g, mostrarConta: true })) },
  ]
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const mesmoNome = (a: string, b: string) => semAcento(a.trim()) === semAcento(b.trim())
export const contem = (texto: string, busca: string) => semAcento(texto).includes(semAcento(busca.trim()))

/** Busca por nome, Conta, cidade, loja ou parte do CNPJ (só os dígitos). Bloco que fica vazio sai. */
export function filtrarBlocos(blocos: BlocoDoSeletor[], busca: string): BlocoDoSeletor[] {
  const q = semAcento(busca.trim())
  if (!q) return blocos
  const digitos = busca.replace(/\D/g, '')
  return blocos
    .map(b => ({
      ...b,
      grupos: b.grupos.filter(g =>
        semAcento([g.nome, g.contaNome, g.cidade ?? '', b.titulo ?? '', ...g.lojas].join(' ')).includes(q)
        || (digitos.length >= 3 && g.cnpj.replace(/\D/g, '').includes(digitos))),
    }))
    .filter(b => b.grupos.length)
}

// Primeira e última palavra ("Grupo Teste BH" vira GB); número curto no fim entra (CF2).
export function iniciaisDoGrupo(nome: string): string {
  const p = nome.replace(/-/g, ' ').split(/\s+/).filter(Boolean)
  const fim = p.length > 1 && /^\d+$/.test(p[p.length - 1]) ? p.pop()! : ''
  const n = fim.length <= 2 ? fim : ''
  const base = p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] ?? '').slice(0, n ? 1 : 2)
  return base.toUpperCase() + n
}
