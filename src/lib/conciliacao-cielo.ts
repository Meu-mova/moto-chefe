// Leitor do relatório "Detalhado de vendas" da Cielo. Função pura: recebe o texto já
// decodificado e devolve as transações ou a recusa. Sem banco, sem rede, sem data atual.
//
// O arquivo começa com uma capa (Ouvidoria, filtros, totalizador) e só depois traz o cabeçalho
// das vendas; as colunas são lidas pelo nome (`relatorio-colunas.ts`).
import { tipoDoCartao, type TransacaoDoRelatorio } from '@/lib/conciliacao-cartao'
import { dataBrParaIso } from '@/lib/data-venda'
import { parseNumeroBR } from '@/lib/numero-br'
import { chaveDaColuna, indicesDasColunas, lerLinhasDoRelatorio, linhasDoRelatorio, type Celula } from '@/lib/relatorio-colunas'

export type TransacaoCielo = TransacaoDoRelatorio

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

// "R$ 1.234,56" e "-R$ 23,45": tira o prefixo da moeda e deixa o número para o parseNumeroBR.
const valorEmReais = (texto: string) => parseNumeroBR(texto.replace(/R\$/g, ''))

const parcelasDaForma = (forma: string) => {
  const m = /(\d+)\s*x/i.exec(forma)
  return m ? Number(m[1]) || 1 : 1
}

type Lido = { transacao: TransacaoCielo } | { semCodigo: true } | { ignorada: true } | { erro: string }

function lerVenda(celula: Celula<keyof typeof COLUNAS>, numeroDaLinha: number): Lido {
  const tipo = tipoDoCartao(celula('forma'))
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
  const linhas = linhasDoRelatorio(texto)
  const posCabecalho = linhas.findIndex(ehCabecalho)
  if (posCabecalho < 0) return { ok: false, erro: 'Cabeçalho do relatório da Cielo não encontrado. Confira se o arquivo é o "Detalhado de vendas".' }

  const indices = indicesDasColunas(celulasDaLinha(linhas[posCabecalho]), COLUNAS)
  if ('faltam' in indices) return { ok: false, erro: `O relatório da Cielo não tem a coluna: ${indices.faltam.join(', ')}.` }

  const lido = lerLinhasDoRelatorio(linhas, posCabecalho, indices, lerVenda)
  if (!lido.ok) return lido

  return {
    ok: true,
    transacoes: lido.lidas.flatMap(l => ('transacao' in l ? [l.transacao] : [])),
    semCodigo: lido.lidas.filter(l => 'semCodigo' in l).length,
  }
}
