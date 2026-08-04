// Tipos e regras comuns aos coletores das três operadoras. Ficam aqui, e não
// dentro do route handler, porque os scripts de coleta precisam importá-los
// sem arrastar next/server e a conexão de banco junto.

export type TransacaoCartao = {
  nsu?: string
  autorizacao?: string
  dataTransacao: string   // YYYY-MM-DD
  valorBruto: number
  valorLiquido?: number
  parcelas: number
  tipo: 'credito' | 'debito'
  status: string
  rawData?: Record<string, unknown>
}

export type Operadora = 'infinitypay' | 'stone' | 'pagueveloz'

export type PayloadConciliacao = {
  operadora: Operadora
  // CNPJ do grupo dono das maquininhas, com pontuação, como em grupos.cnpj.
  grupoCnpj: string
  transacoes: TransacaoCartao[]
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

/**
 * Instante (com Z ou com offset) → dia do calendário em Brasília.
 *
 * Uma venda às 01:20Z do dia 04 aconteceu às 22:20 do dia 03 em Brasília.
 * Cortar a string ISO no "T" gravaria dia 04, e o casamento com a venda no
 * MOVA (janela de ±1 dia) passaria a depender de sorte. BRT é UTC−3 fixo desde
 * o fim do horário de verão em 2019. Funciona tanto para "…Z" (InfinitePay,
 * Stone) quanto para "…-03:00" (PagueVeloz), porque o Date já normaliza.
 */
export function dataBrt(iso: string): string {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) throw new Error(`Data inválida: ${iso}`)
  return new Date(instante.getTime() - TRES_HORAS_MS).toISOString().slice(0, 10)
}

/**
 * Chave de deduplicação. O NSU é a chave natural, mas a Stone não manda NSU —
 * nesse caso o id da operadora (guardado em rawData) evita reinserir a mesma
 * venda a cada rodada.
 */
export function chaveDedup(t: TransacaoCartao): { campo: 'nsu' | 'id'; valor: string } | null {
  if (t.nsu) return { campo: 'nsu', valor: t.nsu }
  const id = t.rawData?.id
  if (id != null && id !== '') return { campo: 'id', valor: String(id) }
  return null
}
