// Contas a pagar: compromissos de pagamento, não lançamento financeiro.
//
// Nada aqui encosta em despesas, caixa ou DRE — quem paga lança a despesa por
// aquele caminho. Este módulo existe para o vencimento não passar em branco, que
// é o que acontece hoje quando a data some no calendário e não há onde marcar
// "pago" (relato do Cesar em 01/09/2026).
//
// As regras vivem aqui, puras, para poderem ser provadas sem banco. O I/O fica em
// src/app/(dashboard)/contas-pagar/actions.ts.

export const TIPOS_CONTA = [
  { valor: 'unica',      label: 'Única' },
  { valor: 'recorrente', label: 'Recorrente (todo mês)' },
  { valor: 'automatica', label: 'Automática (% sobre o mês anterior)' },
] as const

export type TipoConta = (typeof TIPOS_CONTA)[number]['valor']

export function isTipoConta(v: string): v is TipoConta {
  return TIPOS_CONTA.some(t => t.valor === v)
}

/**
 * Bases da conta automática. Todas olham o mês ANTERIOR ao da competência — é
 * assim que imposto funciona: o que se paga em setembro é calculado sobre o que
 * foi vendido em agosto.
 *
 * "Com nota fiscal" existe separada porque a base do imposto é o que foi
 * faturado, e nem toda venda lançada tem NF emitida no mesmo mês.
 */
export const BASES_FORMULA = [
  { valor: 'venda_motos',        label: 'Venda de motos do mês anterior' },
  { valor: 'venda_motos_com_nf', label: 'Venda de motos com NF emitida (mês anterior)' },
  { valor: 'venda_pecas',        label: 'Venda de peças do mês anterior' },
  { valor: 'faturamento_total',  label: 'Faturamento total do mês anterior (motos + peças + OS)' },
] as const

export type BaseFormula = (typeof BASES_FORMULA)[number]['valor']

export function isBaseFormula(v: string): v is BaseFormula {
  return BASES_FORMULA.some(b => b.valor === v)
}

export function labelBaseFormula(v: string): string {
  return BASES_FORMULA.find(b => b.valor === v)?.label ?? v
}

/** Mês anterior a 'YYYY-MM', com virada de ano. */
export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return m === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(m - 1).padStart(2, '0')}`
}

/** Último dia do mês, sem depender de fuso (Date.UTC com dia 0 do mês seguinte). */
export function ultimoDiaDoMes(mes: string): number {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m, 0)).getUTCDate()
}

/**
 * Data de vencimento da ocorrência daquele mês.
 *
 * Dia 31 em mês de 30 cai no último dia, e não transborda para o mês seguinte:
 * uma conta que vence "todo dia 31" vence em 30/04, não em 01/05 — senão a
 * competência de abril apareceria dentro de maio.
 */
export function vencimentoNoMes(mes: string, diaVencimento: number): string {
  const dia = Math.min(Math.max(1, Math.trunc(diaVencimento)), ultimoDiaDoMes(mes))
  return `${mes}-${String(dia).padStart(2, '0')}`
}

export type ContaVigencia = {
  ativo: boolean
  /** 'YYYY-MM'. NULL nos dois lados = vale sempre. */
  inicio: string | null
  fim: string | null
}

/** A conta gera ocorrência neste mês? */
export function contaVigenteNoMes(conta: ContaVigencia, mes: string): boolean {
  if (!conta.ativo) return false
  if (conta.inicio && mes < conta.inicio) return false
  if (conta.fim && mes > conta.fim) return false
  return true
}

export type SituacaoConta = 'paga' | 'vencida' | 'vence_hoje' | 'a_vencer'

/**
 * Situação da ocorrência.
 *
 * 'vencida' é o estado que o sistema não tinha: hoje a data passa no calendário e
 * o compromisso simplesmente some de vista. Comparação em texto 'YYYY-MM-DD',
 * que ordena como data e não erra por fuso.
 */
export function situacaoOcorrencia(
  ocorrencia: { pago: boolean; vencimento: string },
  hoje: string,
): SituacaoConta {
  if (ocorrencia.pago) return 'paga'
  const venc = ocorrencia.vencimento.slice(0, 10)
  if (venc < hoje) return 'vencida'
  if (venc === hoje) return 'vence_hoje'
  return 'a_vencer'
}

/** Valor da conta automática: percentual sobre a base apurada no mês anterior. */
export function valorAutomatico(base: number, percentual: number): number {
  const b = Number(base) || 0
  const p = Number(percentual) || 0
  // Base negativa não existe em faturamento; se vier, o compromisso é zero e não
  // um crédito a receber disfarçado de conta a pagar.
  return Math.max(0, b) * (p / 100)
}
