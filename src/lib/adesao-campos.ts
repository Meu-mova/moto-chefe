// Campos e status do contrato de adesão (#165) sem dependência de servidor: o
// painel de /admin/adesoes roda no navegador e não pode puxar @/lib/email (Resend).

export type StatusAdesao = 'pendente' | 'dados_completos' | 'recusada'

export const ROTULO_STATUS_ADESAO: Record<StatusAdesao, string> = {
  pendente: 'Pendente',
  dados_completos: 'Dados completos',
  recusada: 'Recusada',
}

export const CAMPOS_CONTRATO = [
  { chave: 'razaoSocial', rotulo: 'Razão social' },
  { chave: 'cnpj', rotulo: 'CNPJ' },
  { chave: 'enderecoSede', rotulo: 'Endereço da sede' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'responsavelCpf', rotulo: 'CPF do responsável' },
  { chave: 'valorMensal', rotulo: 'Mensalidade (R$)' },
  { chave: 'diaVencimento', rotulo: 'Dia de vencimento' },
] as const

export type CampoContrato = typeof CAMPOS_CONTRATO[number]['chave']

export function camposFaltando(dados: Partial<Record<CampoContrato, unknown>>): string[] {
  return CAMPOS_CONTRATO
    .filter(c => dados[c.chave] === null || dados[c.chave] === undefined || dados[c.chave] === '')
    .map(c => c.rotulo)
}
