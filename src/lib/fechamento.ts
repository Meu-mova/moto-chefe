// Helpers puros do relatório de fechamento — sem banco, cobertos por teste.

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function nomeMes(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? '?'} ${ano}`
}

/** Mês anterior, virando o ano em janeiro. */
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
}

/** Variação percentual; null quando não há base de comparação (mês anterior zero). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return ((atual - anterior) / anterior) * 100
}

/** % da meta; null quando não há meta cadastrada. */
export function pctMeta(realizado: number, meta: number): number | null {
  if (!meta) return null
  return (realizado / meta) * 100
}

/** Faixa do atingimento: bateu (≥100%), perto (≥90%) ou abaixo. */
export function classeMeta(pct: number | null): 'batida' | 'perto' | 'abaixo' | 'sem' {
  if (pct == null) return 'sem'
  if (pct >= 100) return 'batida'
  if (pct >= 90) return 'perto'
  return 'abaixo'
}

/** "YYYY-MM" válido? */
export function mesValido(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

export function parseMes(s: string): { ano: number; mes: number } {
  const [ano, mes] = s.split('-').map(Number)
  return { ano, mes }
}

export function formatarMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`
}
