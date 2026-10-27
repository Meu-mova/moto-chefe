// Sem banco: usado pelas telas de pagamento (#460).
import type { Maquininha } from '@/lib/maquininhas'

/**
 * Opções da edição: as do grupo mais a operadora já gravada no registro, para a venda antiga
 * continuar mostrando e mantendo o que tinha (o servidor aceita a já gravada).
 */
export function opcoesComGravada(doGrupo: Maquininha[] | null, gravadas: (string | undefined)[]): Maquininha[] {
  const lista = [...(doGrupo ?? [])]
  for (const o of gravadas) {
    if (o && !lista.some(m => m.operadora === o)) lista.push({ operadora: o, nome: o })
  }
  return lista
}
