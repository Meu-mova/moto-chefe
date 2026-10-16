// Campos e status do contrato de adesão (#165) sem dependência de servidor: o
// painel de /admin/adesoes roda no navegador e não pode puxar @/lib/email (Resend).

// 'processada' vem da 0115 e nenhum código grava; existe só para o tipo bater
// com o CHECK do banco.
export type StatusAdesao = 'pendente' | 'dados_completos' | 'recusada' | 'processada'

export const ROTULO_STATUS_ADESAO: Record<StatusAdesao, string> = {
  pendente: 'Pendente',
  dados_completos: 'Dados completos',
  recusada: 'Recusada',
  processada: 'Processada',
}

type MetaCampo = {
  chave: string
  rotulo: string
  /** Ocupa a linha inteira no formulário. */
  largo?: true
  inputMode?: 'numeric' | 'decimal' | 'email'
}

export const CAMPOS_CONTRATO = [
  { chave: 'razaoSocial', rotulo: 'Razão social', largo: true },
  { chave: 'cnpj', rotulo: 'CNPJ', inputMode: 'numeric' },
  { chave: 'enderecoSede', rotulo: 'Endereço da sede', largo: true },
  { chave: 'email', rotulo: 'E-mail', inputMode: 'email' },
  { chave: 'responsavelCpf', rotulo: 'CPF do responsável', inputMode: 'numeric' },
  { chave: 'taxaImplantacao', rotulo: 'Implantação (R$)', inputMode: 'decimal' },
  { chave: 'valorMensal', rotulo: 'Mensalidade (R$)', inputMode: 'decimal' },
] as const satisfies readonly MetaCampo[]

export type CampoContrato = typeof CAMPOS_CONTRATO[number]['chave']

export function camposFaltando(dados: Partial<Record<CampoContrato, unknown>>): string[] {
  return CAMPOS_CONTRATO
    .filter(c => dados[c.chave] === null || dados[c.chave] === undefined || dados[c.chave] === '')
    .map(c => c.rotulo)
}
