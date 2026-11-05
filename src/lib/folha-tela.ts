import { mesBrt, rotuloMesCurto } from './data-venda'
import { labelDaBase } from './folha'
import { fmtBRL } from './preco-minimo'

// Regras de apresentação da /folha-pagamento que não dependem de React: as abas, o que cada uma
// segue dos filtros do cabeçalho, e a conta de mês e de URL.

const AVISO_SO_MES = 'Mostra todas as lojas do grupo: o filtro de loja não muda esta aba. Segue o mês escolhido.'

// Fonte única das abas: o seletor "Seção", a barra de abas e o aviso saem desta lista.
// `aviso` só existe onde a aba ignora um dos filtros do cabeçalho; `imprime` marca a aba cujo
// conteúdo o botão Imprimir do cabeçalho reproduz.
export const ABAS_FOLHA: readonly { id: string; rotulo: string; aviso: string | null; imprime: boolean }[] = [
  { id: 'mes', rotulo: 'Folha do Mês', aviso: null, imprime: true },
  { id: 'funcionarios', rotulo: 'Funcionários', aviso: 'Mostra quem é da loja escolhida no filtro. O mês não muda esta aba: estes valores valem todo mês até alguém mudar.', imprime: false },
  { id: 'comissoes', rotulo: 'Comissões', aviso: 'Mostra as regras de todas as lojas do grupo; o mês só define quais estão vigentes.', imprime: false },
  { id: 'premiacao', rotulo: 'Premiação (OTE)', aviso: 'Vale para o grupo todo e para todo mês: os filtros de loja e de mês não mudam esta aba.', imprime: false },
  { id: 'adiantamentos', rotulo: 'Adiantamentos', aviso: AVISO_SO_MES, imprime: false },
  { id: 'holerites', rotulo: 'Holerites', aviso: null, imprime: false },
  { id: 'ajustes', rotulo: 'Ajustes', aviso: AVISO_SO_MES, imprime: false },
]

export const avisoDaAba = (id: string): string | null => ABAS_FOLHA.find(a => a.id === id)?.aviso ?? null

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * `mes` é 'YYYY-MM'. Soma `delta` meses e vira o ano quando precisa. Um `?mes=` que não é mês
 * (digitado à mão na URL) parte de `mesDeReferencia`, em vez de virar "NaN-NaN".
 * Não reusa `mesAnterior` (contas-pagar.ts) nem `proximoMes` (avaliacoes.ts): cada um anda um
 * mês para um lado só e nenhum trata mês inválido.
 */
export function mesAdjacente(mes: string, delta: number, mesDeReferencia: string = mesBrt()): string {
  const [ano, m] = (MES_VALIDO.test(mes) ? mes : mesDeReferencia).split('-').map(Number)
  const indice = ano * 12 + (m - 1) + delta
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`
}

// UTC e meio-dia: `new Date('2026-10-15')` é meia-noite UTC e, em fuso negativo, cairia no dia anterior.
export const rotuloMes = (mes: string): string =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** URL com um filtro trocado e os demais mantidos; valor vazio tira o filtro. */
export function hrefComFiltro(pathname: string, search: string, chave: string, valor: string): string {
  const params = new URLSearchParams(search)
  if (valor) params.set(chave, valor)
  else params.delete(chave)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

// Centavo de arredondamento não é divergência.
const CENTAVO = 0.005

/** Valor real menos o calculado; null enquanto ninguém informou o valor real. */
export function diferencaValorReal(valorReal: number | null, totalPagar: number): number | null {
  if (valorReal === null) return null
  const diferenca = valorReal - totalPagar
  return Math.abs(diferenca) < CENTAVO ? 0 : diferenca
}

/** Texto curto da linha da folha no celular, que não tem espaço para a coluna do valor real. */
export function situacaoValorReal(valorReal: number | null, totalPagar: number): { tipo: 'sem' | 'confere' | 'diverge'; texto: string } {
  const diferenca = diferencaValorReal(valorReal, totalPagar)
  if (diferenca === null) return { tipo: 'sem', texto: 'Sem valor real' }
  if (diferenca === 0) return { tipo: 'confere', texto: 'Real confere' }
  return { tipo: 'diverge', texto: `Real ${diferenca > 0 ? '+' : '-'}${fmtBRL(Math.abs(diferenca))}` }
}

/** Uma regra de comissão ou premiação em uma linha: "1% motos vendidas por ele · R$ 183.040,00". */
export const descreverRegra = (r: { percentual: number; base: string; valorBase: number }): string =>
  `${r.percentual.toLocaleString('pt-BR')}% ${labelDaBase(r.base).toLowerCase()} · ${fmtBRL(r.valorBase)}`

/** Percentual de regra como o banco entrega ('0.30'): "0,3", "0,05", "1,0". De 1 a 3 casas. */
export const fmtPercentual = (v: string): string =>
  parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })

/** Até quando uma regra de comissão vale: "Vale sempre", "Vale desde jan/2026", "Vale de jan/2026 a mar/2026". */
export function rotuloVigencia(inicio: string | null, fim: string | null): string {
  if (inicio && fim) return `Vale de ${rotuloMesCurto(inicio)} a ${rotuloMesCurto(fim)}`
  if (inicio) return `Vale desde ${rotuloMesCurto(inicio)}`
  if (fim) return `Vale até ${rotuloMesCurto(fim)}`
  return 'Vale sempre'
}
