// Regras puras do sync incremental de saídas do banco (Despesas), testáveis sem banco nem mcp.ai.

const DIA_MS = 24 * 60 * 60 * 1000

// Sync incremental: pede ao mcp.ai só o que veio depois do último sync, com folga para o atraso com
// que o banco posta e reemite lançamentos (maior atraso medido até aparecer no banco: 12,8 dias).
// O histórico inteiro só vem no primeiro sync do grupo (PIX e Despesas) ou com ?sync=completo (Despesas).
export const MARGEM_SYNC_DIAS = 30
export const HISTORICO_DESDE = new Date('2025-01-01T00:00:00.000Z')

/**
 * Data a partir da qual pedir o extrato ao mcp.ai. Sem sync anterior (grupo novo), ou com sync
 * completo forçado, usa `padrao`. A margem cobre o atraso com que o banco posta e reemite
 * lançamentos: em produção o maior atraso medido até aparecer no banco foi de 12,8 dias (14/10).
 */
export function desdeDoSync(ultimaSincronizacao: Date | null, margemDias: number, padrao: Date): Date {
  if (!ultimaSincronizacao) return padrao
  const desde = new Date(ultimaSincronizacao.getTime() - margemDias * DIA_MS)
  return desde < padrao ? padrao : desde
}

/**
 * Linhas do banco que o extrato deixou de trazer ("sumidas"), candidatas a ser a versão antiga de
 * uma reemissão. Com o `from` do sync incremental, o extrato não traz nada anterior a `desde`: sem
 * este corte, uma linha válida e antiga pareceria "sumida" e poderia ser pareada e apagada por
 * engano (ex.: pedágio de mesmo valor, dia e descrição).
 */
export function selecionarSumidas<T extends { id: string; transacaoId: string; data: Date }>(
  vizinhas: T[],
  idsInseridas: Set<string>,
  idsTransacaoNoExtrato: Set<string>,
  desde: Date,
): T[] {
  return vizinhas.filter(
    v => !idsInseridas.has(v.id) && !idsTransacaoNoExtrato.has(v.transacaoId) && v.data >= desde,
  )
}

/**
 * Data a gravar como "último sync" depois de uma leitura. Com conta pulada devolve `null` (não grava):
 * a data fica onde estava e o próximo sync relê a janela que a conta perdeu. Avançar a data nesse caso
 * deixaria a lacuna fora da margem do próximo `desdeDoSync` assim que passasse dela.
 */
export function dataAposSync(agora: Date, contasPuladas: string[]): Date | null {
  return contasPuladas.length === 0 ? agora : null
}

/** URL de /despesas sem o parâmetro `sync`, mantendo os demais (mes, sfrom, sto...). */
export function urlDespesasSemSync(params: Record<string, string | undefined>): string {
  const resto = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (chave !== 'sync' && valor !== undefined) resto.set(chave, valor)
  }
  const query = resto.toString()
  return query ? `/despesas?${query}` : '/despesas'
}

/** Divide em lotes de até `tamanho`. O Postgres aceita no máximo 65.535 parâmetros por instrução. */
export function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
  if (tamanho < 1) throw new Error('tamanho do lote deve ser >= 1')
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}
