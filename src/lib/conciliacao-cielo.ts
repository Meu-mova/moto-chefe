// Leitor do relatório "Detalhado de vendas" da Cielo. Função pura: recebe o texto já
// decodificado e devolve as transações ou a recusa. Sem banco, sem rede, sem data atual.
//
// O arquivo começa com uma capa (Ouvidoria, filtros, totalizador) e só depois traz o cabeçalho
// das vendas; as colunas são lidas pelo nome (`relatorio-colunas.ts`).
import type { TransacaoCartao } from '@/lib/conciliacao-cartao'
import { dataBrParaIso } from '@/lib/data-venda'
import { parseNumeroBR } from '@/lib/numero-br'
import { chaveDaColuna, indicesDasColunas } from '@/lib/relatorio-colunas'

// O leitor só devolve venda com Código da venda e com os dois valores lidos.
export type TransacaoCielo = TransacaoCartao & {
  nsu: string
  valorLiquido: number
  rawData: { bandeira: string; portador: string | null; serial: string | null }
}

export type ResultadoCielo =
  | { ok: true; transacoes: TransacaoCielo[]; semCodigo: number }
  | { ok: false; erro: string }

const COLUNAS = {
  data: 'Data da venda',
  forma: 'Forma de pagamento',
  bandeira: 'Bandeira',
  bruto: 'Valor bruto',
  liquido: 'Valor líquido',
  status: 'Status da venda',
  autorizacao: 'Código de autorização',
  codigo: 'Código da venda',
  cartao: 'Número do cartão',
  maquina: 'Número da máquina',
} as const

const celulasDaLinha = (linha: string) => linha.split(';')

const ehCabecalho = (linha: string) => {
  const nomes = celulasDaLinha(linha).map(chaveDaColuna)
  return nomes.includes(chaveDaColuna(COLUNAS.data)) && nomes.includes(chaveDaColuna(COLUNAS.status))
}

type Indices = Record<keyof typeof COLUNAS, number>

// "R$ 1.234,56" e "-R$ 23,45": tira o prefixo da moeda e deixa o número para o parseNumeroBR.
const valorEmReais = (texto: string) => parseNumeroBR(texto.replace(/R\$/g, ''))

// "Crédito à vista" / "Crédito parcelado loja 02x" / "Débito". Os trechos "dito" e "bito" são
// ASCII e sobrevivem a qualquer codificação do acento. Pix, saque e afins não são cartão.
function tipoDaForma(forma: string): 'credito' | 'debito' | null {
  const f = forma.toLowerCase()
  if (f.includes('bito')) return 'debito'
  if (f.includes('dito')) return 'credito'
  return null
}

const parcelasDaForma = (forma: string) => {
  const m = /(\d+)\s*x/i.exec(forma)
  return m ? Number(m[1]) || 1 : 1
}

type Lido = { transacao: TransacaoCielo } | { semCodigo: true } | { ignorada: true } | { erro: string }

function lerVenda(celulas: string[], i: Indices, numeroDaLinha: number): Lido {
  const celula = (campo: keyof Indices) => (celulas[i[campo]] ?? '').trim()
  const tipo = tipoDaForma(celula('forma'))
  if (celula('status') !== 'Aprovada' || !tipo) return { ignorada: true }

  const dataTransacao = dataBrParaIso(celula('data'))
  if (!dataTransacao) return { erro: `Data da venda inválida na linha ${numeroDaLinha}. Nada foi gravado.` }
  const valorBruto = valorEmReais(celula('bruto'))
  const valorLiquido = valorEmReais(celula('liquido'))
  if (valorBruto === null || valorLiquido === null) {
    return { erro: `Valor ilegível na linha ${numeroDaLinha}. Nada foi gravado.` }
  }

  // O "Código da venda" é o id único da transação. O NSU/DOC é um contador de 6 dígitos que
  // reinicia por aparelho e se repete: não serve de chave, e sem o código a linha não entra.
  const codigo = celula('codigo')
  if (!codigo) return { semCodigo: true }

  const autorizacao = celula('autorizacao')
  return {
    transacao: {
      nsu: codigo,
      autorizacao: autorizacao && !/^0+$/.test(autorizacao) ? autorizacao : undefined,
      dataTransacao,
      valorBruto,
      valorLiquido,
      parcelas: parcelasDaForma(celula('forma')),
      tipo,
      status: 'aprovado',
      rawData: {
        bandeira: celula('bandeira').toLowerCase(),
        portador: celula('cartao') || null,
        serial: celula('maquina') || null,   // serial da maquininha: trava de grupo errado
      },
    },
  }
}

export function lerRelatorioCielo(texto: string): ResultadoCielo {
  const linhas = texto.split(/\r?\n/)
  const posCabecalho = linhas.findIndex(ehCabecalho)
  if (posCabecalho < 0) return { ok: false, erro: 'Cabeçalho do relatório da Cielo não encontrado. Confira se o arquivo é o "Detalhado de vendas".' }

  const indices = indicesDasColunas(celulasDaLinha(linhas[posCabecalho]), COLUNAS)
  if ('faltam' in indices) return { ok: false, erro: `O relatório da Cielo não tem a coluna: ${indices.faltam.join(', ')}.` }

  const lidas = linhas
    .map((linha, pos) => ({ linha, numero: pos + 1 }))
    .slice(posCabecalho + 1)
    .filter(({ linha }) => linha.trim() !== '')
    .map(({ linha, numero }) => lerVenda(celulasDaLinha(linha), indices, numero))

  const recusa = lidas.find((l): l is { erro: string } => 'erro' in l)
  if (recusa) return { ok: false, erro: recusa.erro }

  return {
    ok: true,
    transacoes: lidas.flatMap(l => ('transacao' in l ? [l.transacao] : [])),
    semCodigo: lidas.filter(l => 'semCodigo' in l).length,
  }
}
