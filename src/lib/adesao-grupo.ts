import { somenteDigitos } from '@/lib/grupo-cnpj'

/** Avisa quando o grupo escolhido tem outro CNPJ; não impede o vínculo (ADR-0011). */
export function avisoCnpjDoGrupo(cnpjAdesao: string | null, cnpjGrupo: string): string | null {
  if (!cnpjAdesao) return null
  if (somenteDigitos(cnpjAdesao) === somenteDigitos(cnpjGrupo)) return null
  return 'Vinculado, mas o CNPJ do grupo é diferente do CNPJ do contrato. Confira se é o grupo certo.'
}

/**
 * Quando a adesão pode definir a mensalidade de um grupo: só com o contrato assinado e
 * nunca recusada. Desligar (grupoId nulo) é sempre permitido.
 */
export function motivoBloqueioVinculo(p: { grupoId: string | null; statusAdesao: string; contratoAssinado: boolean }): string | null {
  if (!p.grupoId) return null
  if (p.statusAdesao === 'recusada') return 'Adesão recusada não define a mensalidade de um grupo'
  if (!p.contratoAssinado) return 'Ligue o grupo depois que o contrato for assinado'
  return null
}
