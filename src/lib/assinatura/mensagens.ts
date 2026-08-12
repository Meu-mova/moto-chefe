// Todo disparo do MOVA começa com "MOVA INFORMA" — é como o cliente reconhece
// que a mensagem é da loja e não de golpe.
const CABECALHO = 'MOVA INFORMA'

export function msgConvite(nome: string, tipoLabel: string, url: string): string {
  return `${CABECALHO}\n\nOlá, ${nome}! Seu ${tipoLabel} está pronto para assinatura digital.\n\nAcesse o link, confira o documento e assine pelo celular:\n${url}\n\nO link é pessoal e vale por 7 dias.`
}

export function msgCodigo(codigo: string): string {
  return `${CABECALHO}\n\nSeu código de assinatura é ${codigo}.\n\nEle vale por 10 minutos. Não compartilhe este código com ninguém, nem com atendentes.`
}

/**
 * E-mail do código de assinatura. O código vai SÓ no corpo — nunca no assunto,
 * que aparece em prévia/notificação e não pode carregar o segredo. É o que
 * mantém a prova de posse: só quem abre a caixa do cliente vê o código.
 */
export function emailCodigo(codigo: string): { assunto: string; texto: string; html: string } {
  const assunto = `${CABECALHO} — código de assinatura`
  const texto =
    `${CABECALHO}\n\nSeu código de assinatura é ${codigo}.\n\n` +
    `Ele vale por 10 minutos. Não compartilhe este código com ninguém, nem com atendentes.`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0F1419">` +
    `<p style="font-size:12px;letter-spacing:.08em;color:#10986A;font-weight:700;margin:0 0 12px">${CABECALHO}</p>` +
    `<p style="margin:0 0 8px;font-size:15px">Seu código de assinatura é:</p>` +
    `<p style="font-size:34px;font-weight:700;letter-spacing:.18em;margin:8px 0 16px">${codigo}</p>` +
    `<p style="margin:0 0 4px;font-size:13px;color:#475569">Ele vale por 10 minutos.</p>` +
    `<p style="margin:0;font-size:13px;color:#475569">Não compartilhe este código com ninguém, nem com atendentes.</p>` +
    `</div>`
  return { assunto, texto, html }
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
