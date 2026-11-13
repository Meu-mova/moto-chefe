// Leitor do relatório de operações da Rendimento ("OperaçõesCartão.<data>.csv"). Função pura:
// recebe o texto já decodificado e devolve as operações ou a recusa. Sem banco, sem rede, sem
// data atual. Uma linha por operação, cabeçalho na 1ª linha.
import type { TransacaoDoRelatorio } from '@/lib/conciliacao-cartao'
import { tipoDoCupom } from '@/lib/conciliacao-pagueveloz'
import { dataBrParaIso } from '@/lib/data-venda'
import { parseNumeroBR } from '@/lib/numero-br'
import { indicesDasColunas, lerLinhasDoRelatorio } from '@/lib/relatorio-colunas'

export type ResultadoRendimento =
  | { ok: true; transacoes: TransacaoDoRelatorio[] }
  | { ok: false; erro: string }

const COLUNAS = {
  codigo: 'Código',
  conta: 'Conta',
  data: 'Data Pagamento',
  bandeira: 'Bandeira',
  portador: 'Portador do Cartão',
  bruto: 'Valor Total da Operação',
  liquido: 'Valor Total a Pagar',
  parcelas: 'Parcelas',
  status: 'Status',
  codigoVenda: 'Cód. Venda',
} as const

type Indices = Record<keyof typeof COLUNAS, number>

type Lida = { transacao: TransacaoDoRelatorio } | { ignorada: true } | { erro: string }

function lerOperacao(celulas: string[], i: Indices, numeroDaLinha: number): Lida {
  const celula = (campo: keyof Indices) => (celulas[i[campo]] ?? '').trim()
  if (celula('status') !== 'Pago') return { ignorada: true }

  // "03/11/2026 15:20:00" já vem na hora da loja: vale o dia, sem conversão de fuso.
  const dataTransacao = dataBrParaIso(celula('data').split(' ')[0])
  if (!dataTransacao) return { erro: `Data do pagamento inválida na linha ${numeroDaLinha}. Nada foi gravado.` }
  const valorBruto = parseNumeroBR(celula('bruto'))
  const valorLiquido = parseNumeroBR(celula('liquido'))
  if (valorBruto === null || valorLiquido === null) return { erro: `Valor ilegível na linha ${numeroDaLinha}. Nada foi gravado.` }
  const codigo = celula('codigo')
  if (!codigo) return { erro: `Código vazio na linha ${numeroDaLinha}. Nada foi gravado.` }

  // À vista vem com 0 parcelas. O arquivo não diz se foi crédito ou débito: vale o critério
  // da PagueVeloz (mais de 1 parcela é crédito), a confirmar com a loja (#870).
  if (!/^\d+$/.test(celula('parcelas'))) return { erro: `Parcelas inválidas na linha ${numeroDaLinha}. Nada foi gravado.` }
  const parcelas = Math.max(Number(celula('parcelas')), 1)
  return {
    transacao: {
      nsu: codigo,
      // O Cód. Venda é o que sai no comprovante; o "Código de Autorização." vem com prefixo.
      autorizacao: celula('codigoVenda') || undefined,
      dataTransacao,
      valorBruto,
      valorLiquido,
      parcelas,
      tipo: tipoDoCupom(null, parcelas),
      status: 'aprovado',
      rawData: {
        bandeira: celula('bandeira').toLowerCase(),
        portador: celula('portador') || null,
        serial: celula('conta') || null,   // conta da loja na Rendimento: trava de grupo errado
      },
    },
  }
}

export function lerRelatorioRendimento(texto: string): ResultadoRendimento {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const indices = indicesDasColunas(linhas[0].split(';'), COLUNAS)
  if ('faltam' in indices) {
    // Sem nem as colunas-chave, não é o relatório da Rendimento; com elas, falta coluna específica.
    const pareceRendimento = !indices.faltam.includes(COLUNAS.data) && !indices.faltam.includes(COLUNAS.status)
    return pareceRendimento
      ? { ok: false, erro: `O relatório da Rendimento não tem a coluna: ${indices.faltam.join(', ')}.` }
      : { ok: false, erro: 'Cabeçalho do relatório da Rendimento não encontrado. Confira se o arquivo é o de operações da Rendimento.' }
  }

  const lido = lerLinhasDoRelatorio(linhas, 0, (celulas, numero) => lerOperacao(celulas, indices, numero))
  if (!lido.ok) return lido
  return { ok: true, transacoes: lido.lidas.flatMap(l => ('transacao' in l ? [l.transacao] : [])) }
}
