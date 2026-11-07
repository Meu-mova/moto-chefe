// Forma comum das recusas do Arquivar (#688) e do Remover moto (#692): puras, usadas pelo diálogo e pelo servidor.

/** Uma recusa: quando trava e a frase. A ordem da lista é a ordem de prioridade da frase mostrada. */
export type Recusa<P> = readonly [(p: P) => boolean, (p: P) => string]

export function primeiraRecusa<P>(recusas: readonly Recusa<P>[], p: P): string | null {
  const recusa = recusas.find(([trava]) => trava(p))
  return recusa ? recusa[1](p) : null
}

/** Recusa o lote sem moto, ou pela primeira moto travada, com o chassi na frente. */
export function recusaDasMotos<P>(motos: { chassi: string; pendencias: P }[], motivoDe: (p: P) => string | null): string | null {
  if (motos.length === 0) return 'Escolha ao menos uma moto.'
  const travada = motos
    .map(m => ({ chassi: m.chassi, motivo: motivoDe(m.pendencias) }))
    .find(m => m.motivo !== null)
  return travada ? `${travada.chassi}: ${travada.motivo}` : null
}
