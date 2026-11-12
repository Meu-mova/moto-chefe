// Relatório "Detalhado de vendas" da Cielo SINTÉTICO: mesma estrutura do arquivo real
// (capa, filtros, totalizador e cabeçalho de 43 colunas, separador ";"), com valores,
// seriais, códigos e CNPJ inventados. O arquivo real de cliente nunca entra no repo.

export const CABECALHO_CIELO = [
  'Data da venda', 'Hora da venda', 'Estabelecimento', 'Forma de pagamento', 'Bandeira',
  'Valor bruto', 'Valor Taxa/Tarifa', 'Valor líquido', 'Status da venda', 'Tipo de lançamento',
  'Motivo', 'Data do lançamento', 'Data prevista do pagamento', 'Código de autorização', 'NSU/DOC',
  'Código da venda', 'TID', 'Origem do cartão', 'ID Pix', 'TxID', 'ID de pagamento Pix',
  'Número do cartão', 'Número do pedido', 'Nota fiscal', 'Número do lote', 'Canal da venda',
  'Modalidade', 'Tipo de captura', 'Número da máquina', 'Taxa (%)', 'Valor da taxa', 'Tarifa (%)',
  'Valor da tarifa', 'Taxa de antecipação (%)', 'Valor do saque', 'Valor do troco',
  'Origem do valor', 'Destino do valor', 'Banco de origem', 'Banco de destino', 'Conta de destino',
  'Agência de destino', 'Parcelado cliente',
]

export type LinhaCielo = Record<string, string>

const PADRAO: LinhaCielo = {
  'Data da venda': '03/11/2026', 'Hora da venda': '10:15', 'Estabelecimento': '9999999999',
  'Forma de pagamento': 'Crédito à vista', 'Bandeira': 'Visa', 'Valor bruto': 'R$ 100,00',
  'Valor Taxa/Tarifa': '-R$ 2,00', 'Valor líquido': 'R$ 98,00', 'Status da venda': 'Aprovada',
  'Código de autorização': '123456', 'NSU/DOC': '000111', 'Código da venda': '1000000000000000001',
  'Número do cartão': '411111 **** 1111', 'Número da máquina': '12345678',
}

/** Linha de venda: tudo do padrão, trocando só o que o cenário quer mudar. */
export const vendaCielo = (mudancas: LinhaCielo = {}): LinhaCielo => ({ ...PADRAO, ...mudancas })

const celulas = (cabecalho: string[], linha: LinhaCielo) => cabecalho.map(nome => linha[nome] ?? '').join(';')

type Opcoes = {
  linhas: LinhaCielo[]
  /** [quantidade, bruto, taxa/tarifa, líquido], escrito à mão em cada cenário. */
  totalizador?: [string, string, string, string]
  cabecalho?: string[]
  /** false = só a capa, sem a linha de cabeçalho das vendas. */
  comCabecalho?: boolean
}

export function montarRelatorioCielo({ linhas, totalizador = ['0', 'R$ 0,00', 'R$ 0,00', 'R$ 0,00'], cabecalho = CABECALHO_CIELO, comCabecalho = true }: Opcoes): string {
  const capa = [
    'Ouvidoria: 0800 000 0000', 'Usuário: usuario.sintetico', 'Estabelecimento: 9999999999',
    'CPF/CNPJ: 00.000.000/0001-91', 'Detalhado de vendas Cielo', 'Filtros:',
    'Data da venda: 01/11/2026 a 05/11/2026', 'Status: Aprovada',
    'Totalizador', 'Quantidade de vendas;Valor bruto;Taxa/tarifa;Valor líquido', totalizador.join(';'),
  ]
  const vendas = comCabecalho ? [cabecalho.join(';'), ...linhas.map(l => celulas(cabecalho, l))] : []
  return [...capa, ...vendas, ''].join('\r\n')
}
