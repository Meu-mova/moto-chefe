import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// Formato de /api/v2/PagamentoCartao/ObterRelatorioOperacoes. Duas diferenças
// em relação às outras operadoras: os valores já vêm em reais (não centavos) e
// as datas já vêm em -03:00 (não em UTC).
export type OperacaoPagueVeloz = {
  Id: number
  NSU: number
  CodigoAutorizacao: string
  ValorBruto: number        // reais
  ValorLiquido: number      // reais
  QtdeParcelas: number
  Bandeira: string
  DataVenda: string         // ISO com offset -03:00
  Status: { Nome: string; Valor: string }
  POS?: { Id?: number; Identificador?: string; Apelido?: string }
  CupomEstabelecimento?: string | null
  NumeroCartao?: string | null
}

/**
 * A PagueVeloz não devolve se a venda foi crédito ou débito — a informação só
 * existe no texto do cupom fiscal ("VISA CREDITO 15x", "MASTERCARD DEBITO").
 * Quando o cupom não vem, a única pista é a quantidade de parcelas.
 *
 * Errar aqui troca o rótulo da transação; não muda o valor nem o casamento com
 * a venda, que é feito por valor e data.
 */
export function tipoDoCupom(cupom: string | null | undefined, parcelas: number): 'credito' | 'debito' {
  const texto = (cupom ?? '').toUpperCase()
  if (texto.includes('DEBITO')) return 'debito'
  if (texto.includes('CREDITO')) return 'credito'
  return parcelas > 1 ? 'credito' : 'debito'
}

export function mapearPagueVeloz(operacoes: OperacaoPagueVeloz[]): TransacaoCartao[] {
  return operacoes
    .filter(o => o.Status?.Nome === 'Pago')
    .map(o => ({
      // Vai o `Id` (o "Cod PagueVeloz" da primeira coluna do CSV), não o campo
      // `NSU`. O CSV manual continua existindo como plano B e grava o Id em
      // `nsu` — conferido em produção: a operação Id 43997874 / NSU 508833108
      // está gravada com nsu '43997874', e nenhuma das 71 linhas tem os 9
      // dígitos do NSU da operadora. Gravar o NSU aqui faria os dois caminhos
      // nunca se enxergarem e duplicaria a semana inteira no primeiro clique.
      // O NSU da operadora fica preservado em rawData.
      nsu: o.Id ? String(o.Id) : undefined,
      autorizacao: o.CodigoAutorizacao || undefined,
      dataTransacao: dataBrt(o.DataVenda),
      valorBruto: o.ValorBruto,
      valorLiquido: o.ValorLiquido || undefined,
      parcelas: o.QtdeParcelas || 1,
      tipo: tipoDoCupom(o.CupomEstabelecimento, o.QtdeParcelas),
      status: 'aprovado',
      rawData: {
        id: o.Id,
        nsu_operadora: o.NSU ?? null,
        terminal: o.POS?.Identificador ?? null,
        apelido: o.POS?.Apelido ?? null,
        bandeira: o.Bandeira ?? null,
        numero_cartao: o.NumeroCartao ?? null,
      },
    }))
}
