// Leitor do relatório de pagamentos da Rede. Função pura: recebe o texto já decodificado e
// devolve as vendas ou a recusa. Sem banco, sem rede, sem data atual.
//
// O arquivo traz UMA LINHA POR PARCELA, com o cabeçalho na 1ª linha. Uma venda em 18x vem em 18
// linhas com o mesmo NSU/CV e autorização; o leitor junta as parcelas numa venda só.
import { tipoDoCartao, type TransacaoDoRelatorio } from '@/lib/conciliacao-cartao'
import { dataBrParaIso } from '@/lib/data-venda'
import { parseNumeroBR } from '@/lib/numero-br'
import { indicesDasColunas, lerLinhasDoRelatorio, linhasDoRelatorio, recusaDoCabecalho, type Celula } from '@/lib/relatorio-colunas'
import { centavos } from './centavos'

export type TransacaoRede = TransacaoDoRelatorio

export type ResultadoRede =
  | { ok: true; transacoes: TransacaoRede[]; incompletas: number }
  | { ok: false; erro: string }

const COLUNAS = {
  data: 'data original da venda',
  bruto: 'valor bruto da parcela original',
  liquido: 'valor líquido da parcela',
  nsu: 'NSU/CV',
  autorizacao: 'número da autorização',
  estabelecimento: 'estabelecimento',
  cartao: 'número do cartão',
  modalidade: 'modalidade',
  bandeira: 'bandeira',
  numeroDeParcelas: 'número de parcelas',
  parcela: 'parcela',
  cancelamento: 'cancelamento/contestação',
  status: 'status',
} as const

type Parcela = {
  chave: string
  dataTransacao: string
  autorizacao: string
  valorBruto: number
  valorLiquido: number
  numeroDeParcelas: number
  parcela: string
  tipo: 'credito' | 'debito'
  rawData: TransacaoRede['rawData']
}

type Lida = { parcela: Parcela } | { ignorada: true } | { erro: string }

function lerParcela(celula: Celula<keyof typeof COLUNAS>, numeroDaLinha: number): Lida {
  const tipo = tipoDoCartao(celula('modalidade'))
  if (celula('status').toLowerCase() !== 'paga' || celula('cancelamento') || !tipo) return { ignorada: true }

  const dataTransacao = dataBrParaIso(celula('data'))
  if (!dataTransacao) return { erro: `Data da venda inválida na linha ${numeroDaLinha}. Nada foi gravado.` }
  const valorBruto = parseNumeroBR(celula('bruto'))
  const valorLiquido = parseNumeroBR(celula('liquido'))
  if (valorBruto === null || valorLiquido === null) return { erro: `Valor ilegível na linha ${numeroDaLinha}. Nada foi gravado.` }

  const autorizacao = celula('autorizacao')
  return {
    parcela: {
      // O NSU/CV se repete em dias diferentes: a venda é NSU + autorização + data da venda.
      chave: `${dataTransacao}:${celula('nsu')}:${autorizacao}`,
      dataTransacao,
      autorizacao,
      valorBruto,
      valorLiquido,
      numeroDeParcelas: Number(celula('numeroDeParcelas')) || 1,
      parcela: celula('parcela'),
      tipo,
      rawData: {
        bandeira: celula('bandeira').toLowerCase(),
        portador: celula('cartao') || null,
        serial: celula('estabelecimento') || null,   // ponto de venda da Rede: trava de grupo errado
      },
    },
  }
}

// Venda só entra com todas as parcelas no arquivo: valor parcial conciliaria errado.
function juntarParcelas(parcelas: Parcela[]): TransacaoRede | null {
  const [primeira] = parcelas
  if (new Set(parcelas.map(p => p.parcela)).size !== primeira.numeroDeParcelas) return null
  return {
    nsu: primeira.chave,
    autorizacao: primeira.autorizacao || undefined,
    dataTransacao: primeira.dataTransacao,
    valorBruto: centavos(parcelas.reduce((s, p) => s + p.valorBruto, 0)),
    valorLiquido: centavos(parcelas.reduce((s, p) => s + p.valorLiquido, 0)),
    parcelas: primeira.numeroDeParcelas,
    tipo: primeira.tipo,
    status: 'aprovado',
    rawData: primeira.rawData,
  }
}

export function lerRelatorioRede(texto: string): ResultadoRede {
  const linhas = linhasDoRelatorio(texto)
  const indices = indicesDasColunas(linhas[0].split(';'), COLUNAS)
  if ('faltam' in indices) {
    return { ok: false, erro: recusaDoCabecalho(indices.faltam, [COLUNAS.data, COLUNAS.status], 'Rede', 'de pagamentos da Rede') }
  }

  const lido = lerLinhasDoRelatorio(linhas, 0, indices, lerParcela)
  if (!lido.ok) return lido

  const porVenda = Map.groupBy(lido.lidas.flatMap(l => ('parcela' in l ? [l.parcela] : [])), p => p.chave)
  const vendas = [...porVenda.values()].map(juntarParcelas)
  return {
    ok: true,
    transacoes: vendas.filter((v): v is TransacaoRede => v !== null),
    incompletas: vendas.filter(v => v === null).length,
  }
}
