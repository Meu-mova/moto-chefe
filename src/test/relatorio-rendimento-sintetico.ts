// Relatório de operações da Rendimento SINTÉTICO: mesma estrutura do arquivo real (cabeçalho na
// 1ª linha, 25 colunas, separador ";", fim de linha CRLF, uma linha por operação), com códigos,
// conta, autorizações e valores inventados. O arquivo real de cliente nunca entra no repo.

export const CABECALHO_RENDIMENTO = [
  'Código', 'Conta', 'Usuário', 'Data Pagamento', 'Data Efetivação', 'Data Crédito/Depósito',
  'Serviço', 'Tipo de Captura', 'Bandeira', 'Portador do Cartão', 'Valor de entrada',
  'Honorários', 'Retorno', 'Valor Total da Operação', 'Valor Seguro', 'Valor Total a Pagar',
  'Parcelas', 'Confirmado Credenciadora?', 'Status', 'Situação dos Débitos',
  'Código de Autorização.', 'Maquineta', 'Cód. Venda', 'Cód. Adquirente', 'Mensagem Rendimento',
]

export type LinhaRendimento = Record<string, string>

const PADRAO: LinhaRendimento = {
  'Código': '10000001', 'Conta': '99999-9', 'Usuário': 'USUARIO SINTETICO',
  'Data Pagamento': '03/11/2026 15:20:00', 'Data Efetivação': '03/11/2026 15:20:00',
  'Data Crédito/Depósito': '04/11/2026', 'Serviço': 'Serviços', 'Tipo de Captura': 'POS',
  'Bandeira': 'VISA', 'Portador do Cartão': '', 'Valor de entrada': '0,00', 'Honorários': '0,00',
  'Retorno': '0,00', 'Valor Total da Operação': '3.990,00', 'Valor Seguro': '0,00',
  'Valor Total a Pagar': '3.830,40', 'Parcelas': '2', 'Confirmado Credenciadora?': 'Sim',
  'Status': 'Pago', 'Situação dos Débitos': 'Pago', 'Código de Autorização.': '000000000000-0000A1B2',
  'Maquineta': '', 'Cód. Venda': 'A1B2C3', 'Cód. Adquirente': '', 'Mensagem Rendimento': '',
}

/** Uma operação: tudo do padrão, trocando só o que o cenário quer mudar. */
export const operacaoRendimento = (mudancas: LinhaRendimento = {}): LinhaRendimento => ({ ...PADRAO, ...mudancas })

export function montarRelatorioRendimento(linhas: LinhaRendimento[], cabecalho: string[] = CABECALHO_RENDIMENTO): string {
  return [cabecalho.join(';'), ...linhas.map(l => cabecalho.map(nome => l[nome] ?? '').join(';')), ''].join('\r\n')
}
