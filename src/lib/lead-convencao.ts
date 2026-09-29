import { z } from 'zod'
import { emailValido } from '@/lib/email'

// Dados fixos da demonstração em grupo divulgada na convenção MotoChefe 2026.
export const MEET = {
  titulo: 'Demonstração MOVA',
  quando: 'Terça, 6 de outubro · 15h (horário de Brasília)',
  link: 'https://meet.google.com/etk-mjkk-mpi',
}

// WhatsApp do MOVA com a mensagem pronta para o lead confirmar presença.
export const WHATSAPP = {
  numero: '5535991702105',
  mensagem: 'Estarei na reunião pra conhecer mais do MOVA',
}

export const leadSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome'),
  email: z.string().trim().refine(emailValido, 'E-mail inválido'),
  whatsapp: z.string().trim().min(8, 'Informe seu WhatsApp'),
  unidade: z.string().trim().min(2, 'Informe a unidade da MotoChefe'),
})
export type LeadConvencao = z.infer<typeof leadSchema>

/** Link wa.me com o número e a mensagem já codificados. */
export function waLink(numero: string, mensagem: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

/** E-mail de confirmação enviado AO LEAD, com a data e o link do meet. */
export function emailConfirmacaoLead(nome: string): { assunto: string; texto: string } {
  const primeiro = nome.trim().split(/\s+/)[0] || 'tudo bem'
  return {
    assunto: 'Sua vaga na Demonstração do MOVA está garantida',
    texto: [
      `Olá, ${primeiro}!`,
      '',
      'Recebemos seu contato na convenção da MotoChefe. Sua vaga na demonstração completa do MOVA está garantida:',
      '',
      MEET.titulo,
      MEET.quando,
      `Google Meet: ${MEET.link}`,
      '',
      'É só entrar pelo link no horário. Até lá!',
      '',
      'Equipe MOVA · meumova.com',
    ].join('\n'),
  }
}

/** E-mail de aviso enviado À EQUIPE (Cesar) a cada novo lead. */
export function emailNotificacaoEquipe(lead: LeadConvencao): { assunto: string; texto: string } {
  return {
    assunto: `Novo lead da convenção: ${lead.nome} (${lead.unidade})`,
    texto: [
      'Novo lead capturado na landing /convencao:',
      '',
      `Nome: ${lead.nome}`,
      `Unidade MotoChefe: ${lead.unidade}`,
      `WhatsApp: ${lead.whatsapp}`,
      `E-mail: ${lead.email}`,
    ].join('\n'),
  }
}
