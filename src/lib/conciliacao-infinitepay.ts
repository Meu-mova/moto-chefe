import { dataBrt, type TransacaoCartao } from './conciliacao-cartao'

// Formato de sales-index/v1/sales/search, o serviço interno que o painel da
// InfinitePay usa na tela "Suas vendas". Não é API pública: pode mudar sem
// aviso, por isso o coletor valida a resposta antes de enviar qualquer coisa.
export type VendaInfinitePay = {
  id: number
  datetime: string          // ISO com Z
  amount: number            // centavos, bruto
  net_amount: number | null // centavos, já com a taxa descontada
  method: string            // 'credit' | 'debit' | 'money'
  installments: number
  status: string            // 'approved' | 'denied'
  nsu: string | null
  brand?: string
  serial_number?: string | null
  fee_percentage?: number | null
  type?: string
  transaction_origin?: string
}

/**
 * Descarta o que não é cartão aprovado:
 * - `status !== 'approved'` — negadas (23 em cada 100 na amostra de 30 dias);
 * - `method === 'money'` — venda em dinheiro digitada na maquininha.
 */
export function mapearInfinitePay(vendas: VendaInfinitePay[]): TransacaoCartao[] {
  return vendas
    .filter(v => v.status === 'approved' && v.method !== 'money')
    .map(v => ({
      nsu: v.nsu || undefined,
      dataTransacao: dataBrt(v.datetime),
      valorBruto: v.amount / 100,
      valorLiquido: v.net_amount != null ? v.net_amount / 100 : undefined,
      parcelas: v.installments || 1,
      tipo: v.method === 'debit' ? ('debito' as const) : ('credito' as const),
      status: 'aprovado',
      rawData: v as unknown as Record<string, unknown>,
    }))
}
