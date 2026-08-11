// Todo disparo do MOVA começa com "MOVA INFORMA" — é como o cliente reconhece
// que a mensagem é da loja e não de golpe.
const CABECALHO = 'MOVA INFORMA'

export function msgConvite(nome: string, tipoLabel: string, url: string): string {
  return `${CABECALHO}\n\nOlá, ${nome}! Seu ${tipoLabel} está pronto para assinatura digital.\n\nAcesse o link, confira o documento e assine pelo celular:\n${url}\n\nO link é pessoal e vale por 7 dias.`
}

export function msgCodigo(codigo: string): string {
  return `${CABECALHO}\n\nSeu código de assinatura é ${codigo}.\n\nEle vale por 10 minutos. Não compartilhe este código com ninguém, nem com atendentes.`
}

export function msgAssinado(nome: string, tipoLabel: string, url: string): string {
  return `${CABECALHO}\n\n${nome}, seu ${tipoLabel} foi assinado com sucesso.\n\nGuarde este link — é a sua via do documento:\n${url}`
}

// Número no formato que o mcp.ai espera: 55 + DDD + número, só dígitos.
export function normalizarCelular(bruto: string): string | null {
  const dig = (bruto ?? '').replace(/\D/g, '')
  if (dig.length < 10) return null
  if (dig.startsWith('55') && dig.length >= 12) return dig
  return `55${dig}`
}
