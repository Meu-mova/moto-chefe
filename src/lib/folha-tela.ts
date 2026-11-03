import { mesBrt } from './data-venda'

// Regras de apresentação da /folha-pagamento que não dependem de React: as abas, o que cada uma
// segue dos filtros do cabeçalho, e a conta de mês e de URL.

const AVISO_SO_MES = 'Mostra todas as lojas do grupo: o filtro de loja não muda esta aba. Segue o mês escolhido.'

// Fonte única das abas: o seletor "Seção", a barra de abas e o aviso saem desta lista.
// `aviso` só existe onde a aba ignora um dos filtros do cabeçalho; `imprime` marca a aba cujo
// conteúdo o botão Imprimir do cabeçalho reproduz.
export const ABAS_FOLHA: readonly { id: string; rotulo: string; aviso: string | null; imprime: boolean }[] = [
  { id: 'mes', rotulo: 'Folha do Mês', aviso: null, imprime: true },
  { id: 'funcionarios', rotulo: 'Funcionários', aviso: 'Mostra quem é da loja escolhida no filtro. O mês não muda esta aba: estes valores valem todo mês até alguém mudar.', imprime: false },
  { id: 'comissoes', rotulo: 'Comissões', aviso: AVISO_SO_MES, imprime: false },
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
