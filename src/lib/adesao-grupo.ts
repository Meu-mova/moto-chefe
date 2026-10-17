import { somenteDigitos } from '@/lib/grupo-cnpj'

/** Avisa quando o grupo escolhido tem outro CNPJ; não impede o vínculo (ADR-0011). */
export function avisoCnpjDoGrupo(cnpjAdesao: string | null, cnpjGrupo: string): string | null {
  if (!cnpjAdesao) return null
  if (somenteDigitos(cnpjAdesao) === somenteDigitos(cnpjGrupo)) return null
  return 'Vinculado, mas o CNPJ do grupo é diferente do CNPJ do contrato. Confira se é o grupo certo.'
}
