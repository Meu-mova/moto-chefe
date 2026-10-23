import { ehRecusada } from '@/lib/notagateway/status'

/** Filtros da tela Notas Emitidas (#348). A Denegada separada da Recusada vem da #347. */
export type CategoriaNota = 'autorizada' | 'cancelada' | 'recusada' | 'em_andamento' | 'descartada'

export function classificarNota(status: string): CategoriaNota {
  // CancelamentoNegado: a SEFAZ recusou o cancelamento, a nota continua valendo.
  if (status === 'Autorizada' || status === 'CancelamentoNegado') return 'autorizada'
  if (status === 'Cancelada') return 'cancelada'
  if (ehRecusada(status)) return 'recusada'
  if (status === 'Descartada') return 'descartada'
  // Por exclusão, como a trava do status.ts: status novo da API aparece como em andamento.
  return 'em_andamento'
}
