import { Resend } from 'resend'

export type ResultadoEmail = 'enviado' | 'sem_email' | 'erro'

// Validação simples e conservadora — o objetivo é barrar vazio/lixo antes de
// gastar uma chamada no Resend, não validar RFC 5322 inteira.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(email: string | null | undefined): boolean {
  return !!email && RE_EMAIL.test(email.trim())
}

/**
 * Envia um e-mail transacional via Resend. Nunca lança — devolve o resultado
 * para quem chamou decidir (no fluxo de assinatura, falha de envio precisa
 * aparecer para o cliente, não sumir num log).
 *
 * Config por env (nunca commitada): RESEND_API_KEY e EMAIL_FROM
 * (ex.: "MOVA <assinatura@meumova.com>").
 */
export async function enviarEmail(params: {
  para: string
  assunto: string
  texto: string
  html?: string
}): Promise<ResultadoEmail> {
  const para = params.para?.trim()
  if (!emailValido(para)) return 'sem_email'

  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    console.error('RESEND_API_KEY/EMAIL_FROM não configurados')
    return 'erro'
  }

  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from,
      to: para,
      subject: params.assunto,
      text: params.texto,
      ...(params.html ? { html: params.html } : {}),
    })
    if (error) {
      console.error('envio de e-mail (resend) falhou:', error.message ?? String(error))
      return 'erro'
    }
    return 'enviado'
  } catch (e) {
    console.error('envio de e-mail falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
