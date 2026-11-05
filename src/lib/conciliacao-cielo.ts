// STUB: a implementação vem no commit seguinte (prova de vermelho por asserção).
import type { TransacaoCartao } from '@/lib/conciliacao-cartao'

export type ResultadoCielo =
  | { ok: true; transacoes: TransacaoCartao[]; semCodigo: number }
  | { ok: false; erro: string }

export function lerRelatorioCielo(_texto: string): ResultadoCielo {
  return { ok: false, erro: 'não implementado' }
}
