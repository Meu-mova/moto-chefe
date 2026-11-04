import { mesBrt } from './data-venda'
import { labelDaBase } from './folha'
import { calcularPremiacao, ordenarFaixas } from './premiacao'
import { fmtBRL } from './preco-minimo'

// Regras de apresentação da /folha-pagamento que não dependem de React: as abas, o que cada uma
// segue dos filtros do cabeçalho, e a conta de mês e de URL.

const AVISO_SO_MES = 'Mostra todas as lojas do grupo: o filtro de loja não muda esta aba. Segue o mês escolhido.'

// A Premiação ignora os dois filtros, e o aviso mora no cartão "Como funciona" da própria aba (protótipo
// aprovado do #627), não acima das abas: por isso `aviso: null` nela em ABAS_FOLHA.
export const AVISO_PREMIACAO = 'Vale para o grupo todo e para todo mês: os filtros de loja e de mês não mudam esta aba.'

// Fonte única das abas: o seletor "Seção", a barra de abas e o aviso saem desta lista.
// `aviso` só existe onde a aba ignora um dos filtros do cabeçalho; `imprime` marca a aba cujo
// conteúdo o botão Imprimir do cabeçalho reproduz.
export const ABAS_FOLHA: readonly { id: string; rotulo: string; aviso: string | null; imprime: boolean }[] = [
  { id: 'mes', rotulo: 'Folha do Mês', aviso: null, imprime: true },
  { id: 'funcionarios', rotulo: 'Funcionários', aviso: 'Mostra quem é da loja escolhida no filtro. O mês não muda esta aba: estes valores valem todo mês até alguém mudar.', imprime: false },
  { id: 'comissoes', rotulo: 'Comissões', aviso: 'Mostra as regras de todas as lojas do grupo; o mês só define quais estão vigentes.', imprime: false },
  { id: 'premiacao', rotulo: 'Premiação (OTE)', aviso: null, imprime: false },
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

const MARGEM_DO_EXEMPLO = 1.15

/**
 * Exemplo do "Como funciona" da Premiação: quem vendeu 15% acima do mínimo da 2ª faixa (ou da 1ª, se só
 * há uma). O prêmio e a posição vêm de `calcularPremiacao`, a mesma conta da folha, então o texto segue
 * verdadeiro mesmo que o exemplo ultrapasse a faixa seguinte.
 */
export function exemploDaPremiacao(faixas: { valorMinimoVendas: string; premiacao: string }[]): { vendido: number; premiacao: number; ordinal: number } | null {
  const ordenadas = ordenarFaixas(faixas)
  const base = ordenadas[1] ?? ordenadas[0]
  if (!base) return null
  const vendido = Math.round(parseFloat(base.valorMinimoVendas) * MARGEM_DO_EXEMPLO * 100) / 100
  return {
    vendido,
    premiacao: calcularPremiacao(vendido, ordenadas),
    ordinal: ordenadas.filter(f => parseFloat(f.valorMinimoVendas) <= vendido).length,
  }
}
