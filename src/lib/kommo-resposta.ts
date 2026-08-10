export type EventoChat = { type: string; created_by: number; created_at: number }

// Saída disparada nos primeiros segundos é a resposta automática do canal, não
// atendimento. Medido em 10/08/2026: 2 de cada 3 leads recebem uma saída em
// menos de 10 segundos, e 1.860 deles recebem outra depois (mediana 2min).
export const AUTO_RESPOSTA_SEG = 60

// 1º contato do cliente e 1ª resposta de verdade, sobre os eventos de chat de UM lead.
//
// Qualquer saída conta como resposta, com ou sem autor: quando o vendedor
// responde pelo app do WhatsApp, o Kommo registra a mensagem com created_by = 0.
// Exigir autor marcava 44% dos leads como "sem resposta" quando só 8% não
// tiveram atendimento nenhum. O corte de AUTO_RESPOSTA_SEG tira a automática —
// sem ele o número cai para 5% e a mediana vira 0min, com o robô "respondendo"
// por todo mundo.
//
// A atribuição por colaborador (kommo_atividade_diaria) continua exigindo
// created_by, senão não há a quem atribuir.
export function estadoRespostaDoLead(eventos: EventoChat[]): { leadIn: number | null; leadResp: number | null } {
  const ordenados = [...eventos].sort((a, b) => a.created_at - b.created_at)
  let leadIn: number | null = null
  let leadResp: number | null = null
  for (const m of ordenados) {
    if (m.type === 'incoming_chat_message') {
      if (leadIn == null) leadIn = m.created_at
    } else if (m.type === 'outgoing_chat_message') {
      // Saída antes de o cliente falar não é resposta (leadIn ainda nulo).
      if (leadIn != null && leadResp == null && m.created_at - leadIn >= AUTO_RESPOSTA_SEG) {
        leadResp = m.created_at
      }
    }
  }
  return { leadIn, leadResp }
}
