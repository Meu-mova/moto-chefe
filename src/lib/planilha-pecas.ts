/**
 * Planilha de peças e acessórios da Entrada (#519). Função pura: recebe as linhas como
 * o xlsx devolve (`sheet_to_json` com `header: 1`) e serve à tela e ao servidor.
 */
import { linhaInicial, type LinhaConferencia } from '@/lib/conferencia-pecas'

export type ItemPlanilhaPecas = {
  /** Linha na planilha, contando o cabeçalho, para a mensagem de erro bater com o Excel. */
  linha: number
  codigo: string
  descricao: string
  quantidade: number
  /** Vazio na planilha: a peça existente mantém o custo e a nova fica sem custo. */
  custoUnitario: number | null
  /** Obrigatório só para item novo; quem confere é a gravação, como no XML. */
  precoVenda: number | null
}

export const COLUNAS_PLANILHA_PECAS = ['CÓDIGO', 'DESCRIÇÃO', 'QUANTIDADE', 'CUSTO UNITÁRIO', 'PREÇO DE VENDA'] as const

/** Planilha para baixar na tela: o cabeçalho e uma linha de exemplo genérica. */
export const MODELO_PLANILHA_PECAS: (string | number)[][] = [
  [...COLUNAS_PLANILHA_PECAS],
  ['123', 'Retrovisor esquerdo', 2, 15.5, 39.9],
]

const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim()

const vazia = (row: unknown[]) => row.every(c => String(c ?? '').trim() === '')

/** Número de célula: o do Excel passa direto; texto aceita "R$", milhar com ponto e vírgula decimal. */
function numero(c: unknown): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  let s = String(c ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export function lerPlanilhaPecas(rows: unknown[][]): { itens: ItemPlanilhaPecas[]; erros: string[] } {
  const inicio = rows.findIndex(r => !vazia(r ?? []))
  const cab = inicio < 0 ? [] : rows[inicio].map(normalizar)
  const col = (nome: string) => cab.indexOf(normalizar(nome))
  const [iCodigo, iDescricao, iQuantidade, iCusto, iPreco] = COLUNAS_PLANILHA_PECAS.map(col)
  if (iDescricao < 0 || iQuantidade < 0) {
    return { itens: [], erros: ['A planilha precisa das colunas DESCRIÇÃO e QUANTIDADE'] }
  }

  const itens: ItemPlanilhaPecas[] = []
  const erros: string[] = []
  rows.slice(inicio + 1).forEach((row, i) => {
    if (!row || vazia(row)) return
    const linha = inicio + i + 2
    const cel = (j: number) => (j < 0 ? undefined : row[j])
    const descricao = String(cel(iDescricao) ?? '').trim()
    const quantidade = numero(cel(iQuantidade))
    const custo = numero(cel(iCusto))
    const preco = numero(cel(iPreco))
    const antes = erros.length
    if (!descricao) erros.push(`Linha ${linha}: falta a descrição`)
    if (quantidade === null || !Number.isInteger(quantidade) || quantidade <= 0) {
      erros.push(`Linha ${linha}: a quantidade precisa ser um número inteiro maior que zero`)
    }
    if (custo !== null && !(custo >= 0)) erros.push(`Linha ${linha}: custo unitário inválido`)
    if (preco !== null && !(preco >= 0)) erros.push(`Linha ${linha}: preço de venda inválido`)
    if (erros.length > antes) return
    itens.push({
      linha,
      codigo: String(cel(iCodigo) ?? '').trim(),
      descricao,
      quantidade: quantidade!,
      custoUnitario: custo,
      precoVenda: preco,
    })
  })
  return { itens, erros }
}

/**
 * Linha da mesma conferência do XML. A descrição faz o papel do nome da nota (chave do
 * vínculo) e o preço de venda da planilha já entra na peça nova.
 */
export function linhaDaPlanilha(item: ItemPlanilhaPecas, sugestao: string | null): LinhaConferencia {
  const linha = linhaInicial({
    codigo: item.codigo,
    nomeXml: item.descricao,
    nomeLegivel: item.descricao,
    unidade: '',
    quantidade: item.quantidade,
    quantidadeInteira: true,
    custoUnitario: item.custoUnitario,
    ncm: '',
  }, sugestao)
  return { ...linha, preco: item.precoVenda ? String(item.precoVenda) : '' }
}
