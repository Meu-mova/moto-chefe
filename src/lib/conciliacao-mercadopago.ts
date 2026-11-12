import type { PagamentoMp } from './mercadopago/point'
import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

export type PixMp = { transacaoId: string; data: string; valor: number; pagadorNome: string | null; serial: string | null }

export type Classificacao =
  | { tipo: 'cartao'; transacao: TransacaoCartao }
  | { tipo: 'pix'; pix: PixMp }
  | { tipo: 'estorno'; meio: 'cartao' | 'pix'; chave: string }
  | { tipo: 'ignorar'; motivo: string }

/**
 * Única regra de "veio da maquininha". Suposição (fixtures provisórias, ver README): o pagamento
 * é da Point se point_of_interaction.type for 'POINT' ou se houver o serial do aparelho.
 */
export function ehDaMaquininha(p: PagamentoMp): boolean {
  const poi = p.point_of_interaction
  return poi?.type === 'POINT' || Boolean(poi?.device?.serial_number)
}

const STATUS_ESTORNO = ['refunded', 'charged_back', 'cancelled']

export function classificarPagamento(p: PagamentoMp): Classificacao {
  if (!ehDaMaquininha(p)) return { tipo: 'ignorar', motivo: 'não é da maquininha' }

  const ehPix = p.payment_method_id === 'pix'
  const tipoCartao = p.payment_type_id === 'credit_card' ? 'credito'
    : p.payment_type_id === 'debit_card' ? 'debito' : null
  if (!ehPix && !tipoCartao) return { tipo: 'ignorar', motivo: `meio não tratado: ${p.payment_type_id}` }

  if (STATUS_ESTORNO.includes(p.status)) {
    return { tipo: 'estorno', meio: ehPix ? 'pix' : 'cartao', chave: ehPix ? `mp-${p.id}` : String(p.id) }
  }
  if (p.status !== 'approved') return { tipo: 'ignorar', motivo: `status ${p.status}` }
  if (!p.date_approved) return { tipo: 'ignorar', motivo: 'aprovado sem data de aprovação' }

  const serial = p.point_of_interaction?.device?.serial_number ?? null

  if (ehPix) {
    const nome = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ')
    return {
      tipo: 'pix',
      pix: {
        transacaoId: `mp-${p.id}`,
        data: p.date_approved,
        valor: p.transaction_amount,
        pagadorNome: nome || null,
        serial,
      },
    }
  }

  return {
    tipo: 'cartao',
    transacao: {
      nsu: String(p.id),
      autorizacao: p.authorization_code ?? undefined,
      dataTransacao: dataBrt(p.date_approved),
      valorBruto: p.transaction_amount,
      valorLiquido: p.transaction_details?.net_received_amount,
      parcelas: tipoCartao === 'debito' ? 1 : p.installments || 1,
      tipo: tipoCartao!,
      status: 'aprovado',
      rawData: {
        id: p.id,
        bandeira: p.payment_method_id,
        serial,
        ultimos4: p.card?.last_four_digits ?? null,
        estornado: p.transaction_amount_refunded ?? 0,
      },
    },
  }
}
