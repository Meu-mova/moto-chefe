// Relatório de pagamentos da Rede SINTÉTICO: mesma estrutura do arquivo real (cabeçalho na 1ª
// linha, 30 colunas, separador ";", uma linha por parcela), com valores, NSU, autorizações e
// estabelecimento inventados. O arquivo real de cliente nunca entra no repo.

export const CABECALHO_REDE = [
  'data do recebimento', 'data original da venda', 'data original de vencimento',
  'valor bruto da parcela original', 'valor bruto da parcela atualizada', 'taxa MDR',
  'valor MDR descontado', 'valor líquido da parcela', 'negociada', '%', 'NSU/CV', 'TID',
  'número do pedido', 'número da autorização', 'resumo de vendas/número do lote',
  'nome do estabelecimento', 'estabelecimento', 'número do cartão',
  'indicador de transação tokenizada', 'código IATA', 'modalidade', 'bandeira',
  'número de parcelas', 'parcela', 'banco', 'agência', 'conta-corrente',
  'cancelamento/contestação', 'data do cancelamento', 'status',
]

export type LinhaRede = Record<string, string>

const PADRAO: LinhaRede = {
  'data do recebimento': '05/11/2026', 'data original da venda': '03/11/2026',
  'data original de vencimento': '03/12/2026', 'valor bruto da parcela original': '100,00',
  'taxa MDR': '2,00%', 'valor MDR descontado': '2,00', 'valor líquido da parcela': '98,00',
  'NSU/CV': '11112222', 'número da autorização': '123456', 'nome do estabelecimento': 'LOJA SINTETICA',
  'estabelecimento': '99990000', 'número do cartão': '411111*****1111', 'modalidade': 'Crédito',
  'bandeira': 'Visa', 'número de parcelas': '1', 'parcela': '1', 'banco': 'BANCO FICTICIO',
  'cancelamento/contestação': '', 'status': 'paga',
}

/** Uma linha (parcela): tudo do padrão, trocando só o que o cenário quer mudar. */
export const parcelaRede = (mudancas: LinhaRede = {}): LinhaRede => ({ ...PADRAO, ...mudancas })

/** As N parcelas de uma venda, numeradas de 1 a N, com os mesmos dados da venda. */
export const vendaParceladaRede = (n: number, mudancas: LinhaRede = {}): LinhaRede[] =>
  Array.from({ length: n }, (_, i) => parcelaRede({ 'número de parcelas': String(n), ...mudancas, 'parcela': String(i + 1) }))

export function montarRelatorioRede(linhas: LinhaRede[], cabecalho: string[] = CABECALHO_REDE): string {
  return [cabecalho.join(';'), ...linhas.map(l => cabecalho.map(nome => l[nome] ?? '').join(';')), ''].join('\n')
}
