import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// A lista da Stone (payments-web-bff/sales/v1/organizations/{cnpj}) não traz
// valor líquido nem código de autorização — os dois só existem no detalhe
// (.../details/{id}). Por isso o tradutor recebe os dois juntos.
export type VendaStone = {
  id: string
  created_at: string        // ISO com offset
  payment_method: string    // 'card' | 'pix' | ...
  installments: number
  card_brand?: string
  card_transaction_type?: string  // 'credit' | 'debit'
  status: string            // 'paid' | 'canceled' | ...
  amount: number            // centavos
  situation?: string
  origin?: { type?: string; serial_number?: string }
}

export type DetalheStone = {
  id: string
  amount: number
  net_amount: number        // centavos
  status: string
  card_transaction: {
    type?: string
    authorization_code?: string
    installments?: number
    mdr_amount?: number
  }
  origin?: { type?: string; serial_number?: string }
}

export function mapearStone(
  pares: { venda: VendaStone; detalhe: DetalheStone | null }[],
): TransacaoCartao[] {
  return pares
    // Sem detalhe faltariam líquido e autorização; melhor não enviar do que
    // gravar uma transação capenga que depois ninguém consegue conferir.
    .filter(p => p.detalhe && p.venda.status === 'paid' && p.venda.payment_method === 'card')
    .map(({ venda, detalhe }) => {
      const d = detalhe!
      const tipo = (d.card_transaction.type ?? venda.card_transaction_type) === 'debit'
        ? ('debito' as const)
        : ('credito' as const)
      return {
        autorizacao: d.card_transaction.authorization_code || undefined,
        dataTransacao: dataBrt(venda.created_at),
        valorBruto: venda.amount / 100,
        valorLiquido: d.net_amount / 100,
        parcelas: venda.installments || 1,
        tipo,
        status: 'aprovado',
        rawData: {
          id: venda.id,
          serial_number: venda.origin?.serial_number ?? d.origin?.serial_number ?? null,
          card_brand: venda.card_brand ?? null,
          mdr_amount: d.card_transaction.mdr_amount ?? null,
          origin_type: venda.origin?.type ?? null,
        },
      }
    })
}
