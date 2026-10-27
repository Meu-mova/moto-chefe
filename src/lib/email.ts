import { Resend } from 'resend'
import { emailValido } from '@/lib/email-valido'

// Reexportado: quem já importa daqui continua funcionando.
export { emailValido }

export type ResultadoEmail = 'enviado' | 'sem_email' | 'erro'

/** Resultado do envio + o id do Resend (para casar bounce no webhook). */
export type EnvioEmail = { status: ResultadoEmail; id: string | null }


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
  anexos?: { nome: string; conteudo: Uint8Array }[]
}): Promise<EnvioEmail> {
  const para = params.para?.trim()
  if (!emailValido(para)) return { status: 'sem_email', id: null }

  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    console.error('RESEND_API_KEY/EMAIL_FROM não configurados')
    return { status: 'erro', id: null }
  }

  try {
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send({
      from,
      to: para,
      subject: params.assunto,
      text: params.texto,
      ...(params.html ? { html: params.html } : {}),
      ...(params.anexos?.length ? { attachments: params.anexos.map(a => ({ filename: a.nome, content: Buffer.from(a.conteudo) })) } : {}),
    })
    if (error) {
      console.error('envio de e-mail (resend) falhou:', error.message ?? String(error))
      return { status: 'erro', id: null }
    }
    return { status: 'enviado', id: data?.id ?? null }
  } catch (e) {
    console.error('envio de e-mail falhou:', e instanceof Error ? e.message : String(e))
    return { status: 'erro', id: null }
  }
}
