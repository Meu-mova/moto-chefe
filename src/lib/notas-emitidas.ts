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

/** Filtro "Situação" da tela (#402). "Todas" deixa de fora a Descartada, que nunca virou nota. */
export type Situacao = Exclude<CategoriaNota, 'descartada'> | 'todas'

export function naSituacao(n: { categoria: CategoriaNota }, situacao: Situacao): boolean {
  return situacao === 'todas' ? n.categoria !== 'descartada' : n.categoria === situacao
}

/** Só a autorizada e a cancelada têm documento: a recusada e a em andamento não valem na SEFAZ. */
export function temDocumento(n: { categoria: CategoriaNota }): boolean {
  return n.categoria === 'autorizada' || n.categoria === 'cancelada'
}

/**
 * Notas do download em lote: as marcadas na tabela ou, sem nenhuma marcada, as do filtro.
 * A seleção só escolhe dentro da lista, que já vem filtrada pela Conta na consulta.
 */
export function notasDoLote<N extends { id: string; categoria: CategoriaNota }>(
  notas: N[],
  pedido: { situacao: Situacao; ids: string[] },
): N[] {
  const marcadas = new Set(pedido.ids)
  const escolhida = (n: N) => (marcadas.size === 0 ? naSituacao(n, pedido.situacao) : marcadas.has(n.id))
  return notas.filter(n => temDocumento(n) && escolhida(n))
}

export type TipoArquivo = 'xml' | 'pdf'

export function nomeDoArquivo(n: { id: string; numero: string | null; serie: string | null }, tipo: TipoArquivo): string {
  if (!n.numero) return `NF-sem-numero-${n.id}.${tipo}`
  return `NF-${n.numero}${n.serie ? `-serie-${n.serie}` : ''}.${tipo}`
}

/** Seleção estilo Gmail: "filtro" é todas as notas do filtro, inclusive as de outras páginas e além do teto da lista. */
export function selecaoDaPagina(pagina: string[], marcadas: Set<string>, todasDoFiltro: boolean): 'nenhuma' | 'parte' | 'pagina' | 'filtro' {
  if (todasDoFiltro) return 'filtro'
  const naPagina = pagina.filter(id => marcadas.has(id)).length
  if (naPagina === 0) return 'nenhuma'
  return naPagina === pagina.length ? 'pagina' : 'parte'
}
