import { ehRecusada } from '@/lib/notagateway/status'
import { hojeBrt, mesBrt, parseDataInput } from '@/lib/data-venda'

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

/** Vendas não tem rota por venda: filtra pelo chassi, com o período começando no dia da venda. */
export function linkDaVenda(v: { chassi: string | null; dataVenda: string | null }): string | null {
  if (!v.chassi || !v.dataVenda) return null
  return `/vendas?${new URLSearchParams({ q: v.chassi, de: hojeBrt(new Date(v.dataVenda)) })}`
}

// O formato do <input type="date"> pode trazer dia que não existe (30/02): a volta pelo Date denuncia.
function diaValido(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  return parseDataInput(v).toISOString().slice(0, 10) === v
}

/** Período de emissão da tela, em dias de Brasília. Padrão: do dia 1º do mês corrente até hoje. */
export function periodoEmissao(params: { de?: string; ate?: string }, agora: Date = new Date()): { de: string; ate: string } {
  return {
    de: diaValido(params.de) ? params.de : `${mesBrt(agora)}-01`,
    ate: diaValido(params.ate) ? params.ate : hojeBrt(agora),
  }
}
