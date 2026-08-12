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
 * E-mail de convite: leva o cliente ao link para conferir e assinar o
 * documento. O link não autentica ninguém (a identidade é o código, enviado
 * depois) — então pode ir por e-mail sem risco.
 */
export function emailConvite(nome: string, tipoLabel: string, url: string, loja = 'MotoChefe'): { assunto: string; texto: string; html: string } {
  const assunto = `${tipoLabel} para assinatura`
  const texto =
    `Olá, ${nome}!\n\nSeu ${tipoLabel} está pronto para assinatura digital. ` +
    `Acesse o link abaixo, confira o documento e assine pelo celular:\n${url}\n\n` +
    `O link é pessoal e vale por 7 dias.\n\n${loja}`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0F1419">` +
    `<p style="margin:0 0 12px;font-size:16px">Olá, ${nome}!</p>` +
    `<p style="margin:0 0 16px;font-size:14px;color:#334155">Seu <b>${tipoLabel}</b> está pronto para assinatura digital. Confira o documento e assine pelo celular:</p>` +
    `<p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;background:#10D98A;color:#0F1419;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">Abrir e assinar</a></p>` +
    `<p style="margin:0 0 4px;font-size:12px;color:#94a3b8;word-break:break-all">Ou copie o link: ${url}</p>` +
    `<p style="margin:0 0 16px;font-size:12px;color:#94a3b8">O link é pessoal e vale por 7 dias.</p>` +
    `<p style="margin:0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">${loja}</p>` +
    `</div>`
  return { assunto, texto, html }
}

/**
 * E-mail do código de assinatura. O código vai SÓ no corpo — nunca no assunto,
 * que aparece em prévia/notificação e não pode carregar o segredo. É o que
 * mantém a prova de posse: só quem abre a caixa do cliente vê o código.
 */
export function emailCodigo(codigo: string, loja = 'MotoChefe'): { assunto: string; texto: string; html: string } {
  const assunto = 'Seu código de assinatura'
  const texto =
    `Olá!\n\nSeu código de assinatura é ${codigo}.\n\n` +
    `Ele vale por 10 minutos. Não compartilhe este código com ninguém, nem com atendentes.\n\n${loja}`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0F1419">` +
    `<p style="margin:0 0 8px;font-size:15px">Seu código de assinatura é:</p>` +
    `<p style="font-size:34px;font-weight:700;letter-spacing:.18em;margin:8px 0 16px">${codigo}</p>` +
    `<p style="margin:0 0 4px;font-size:13px;color:#475569">Ele vale por 10 minutos.</p>` +
    `<p style="margin:0 0 16px;font-size:13px;color:#475569">Não compartilhe este código com ninguém, nem com atendentes.</p>` +
    `<p style="margin:0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">${loja}</p>` +
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
