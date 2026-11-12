import type { TransacaoCartao } from '@/lib/conciliacao-cartao'

export type TransacaoRede = TransacaoCartao & {
  nsu: string
  valorLiquido: number
  rawData: { bandeira: string; portador: string | null; serial: string | null }
}

export type ResultadoRede =
  | { ok: true; transacoes: TransacaoRede[]; incompletas: number }
  | { ok: false; erro: string }

export function lerRelatorioRede(_texto: string): ResultadoRede {
  return { ok: false, erro: 'ainda não implementado' }
}
