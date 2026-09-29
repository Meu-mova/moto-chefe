'use server'
import { db } from '@/lib/db'
import { leadsConvencao } from '@/lib/db/schema'
import { enviarEmail } from '@/lib/email'
import { leadSchema, emailConfirmacaoLead, emailNotificacaoEquipe } from '@/lib/lead-convencao'

// Para onde vão os avisos de novo lead. Configurável por env; fallback no e-mail
// do MOVA. (Trocar em produção via LEADS_EMAIL_TO se quiser outro destino.)
const EMAIL_LEADS = process.env.LEADS_EMAIL_TO || 'contato@meumova.com'

export type ResultadoLead = { ok: true } | { ok: false; erro: string }

export async function registrarLeadAction(dados: unknown): Promise<ResultadoLead> {
  const parsed = leadSchema.safeParse(dados)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Confira os dados e tente de novo.' }
  }
  const lead = parsed.data

  try {
    await db.insert(leadsConvencao).values({
      nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp, unidade: lead.unidade,
    })
  } catch (e) {
    console.error('registrarLeadAction: insert falhou', e instanceof Error ? e.message : e)
    return { ok: false, erro: 'Não deu para registrar agora. Tente de novo em instantes.' }
  }

  // E-mails são best-effort: o lead já está salvo; uma falha de envio não pode
  // derrubar a confirmação na tela.
  const conf = emailConfirmacaoLead(lead.nome)
  const aviso = emailNotificacaoEquipe(lead)
  await Promise.allSettled([
    enviarEmail({ para: lead.email, assunto: conf.assunto, texto: conf.texto }),
    enviarEmail({ para: EMAIL_LEADS, assunto: aviso.assunto, texto: aviso.texto }),
  ])

  return { ok: true }
}
