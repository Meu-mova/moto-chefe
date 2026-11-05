/**
 * Padrão de cards do simulador, escolhido por grupo na Precificação.
 * - 'taxas': 21x e 12x calculados pela taxa do cartão sobre o valor mínimo, e PIX.
 * - 'avista_12x': PIX/dinheiro (o valor mínimo) e o total em 12x que o administrador digita
 *   por modelo, sem taxa nenhuma.
 */
export const PADROES_SIMULADOR = ['taxas', 'avista_12x'] as const
export type PadraoSimulador = (typeof PADROES_SIMULADOR)[number]

export const ROTULO_PADRAO: Record<PadraoSimulador, string> = {
  taxas: 'Taxas do cartão (21x, 12x e PIX)',
  avista_12x: 'À vista + 12x com valor fixo',
}

export function ehPadraoSimulador(v: unknown): v is PadraoSimulador {
  return typeof v === 'string' && (PADROES_SIMULADOR as readonly string[]).includes(v)
}

export type DestaqueAvista12x = {
  pix: number
  /** null: o modelo ainda não tem total em 12x. */
  total12x: number | null
  parcela12x: number | null
  /** Desconto do PIX sobre o total em 12x, em % inteiro; null se não houver desconto. */
  descontoPix: number | null
  economiaPix: number | null
}

const centavos = (v: number) => Math.round(v * 100) / 100

export function destaqueAvista12x(valorMinimo: number, valor12x: number | null): DestaqueAvista12x {
  const total12x = valor12x && valor12x > 0 ? valor12x : null
  const economia = total12x !== null ? centavos(total12x - valorMinimo) : null
  return {
    pix: valorMinimo,
    total12x,
    parcela12x: total12x !== null ? centavos(total12x / 12) : null,
    descontoPix: economia !== null && economia > 0 ? Math.round((economia / total12x!) * 100) : null,
    economiaPix: economia !== null && economia > 0 ? economia : null,
  }
}
