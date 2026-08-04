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
  net_amount?: number | null  // centavos
  status: string
  card_transaction: {
    type?: string
    authorization_code?: string
    installments?: number
    mdr_amount?: number
  }
  origin?: { type?: string; serial_number?: string }
}

// Status de venda paga, na grafia que o painel devolveu na captura de
// 2026-08-04 (lista e detalhe usam o mesmo vocabulário). O detalhe é buscado
// depois da listagem: uma venda estornada nesse intervalo chega com a lista
// dizendo 'paid' e o detalhe já dizendo outra coisa — por isso os dois são
// conferidos.
const PAGA = 'paid'

export function mapearStone(
  pares: { venda: VendaStone; detalhe: DetalheStone | null }[],
): TransacaoCartao[] {
  return pares
    // Sem detalhe faltariam líquido e autorização; melhor não enviar do que
    // gravar uma transação capenga que depois ninguém consegue conferir.
    .filter(p => p.detalhe && p.venda.status === PAGA && p.detalhe.status === PAGA && p.venda.payment_method === 'card')
    .map(({ venda, detalhe }) => {
      const d = detalhe!
      const tipo = (d.card_transaction.type ?? venda.card_transaction_type) === 'debit'
        ? ('debito' as const)
        : ('credito' as const)
      return {
        // O CSV da Stone grava o STONE ID (o `id` da venda, "31263367049280")
        // na coluna de NSU — conferido nas 48 linhas já importadas por CSV em
        // produção, todas com 14 dígitos. O agente precisa gravar exatamente o
        // mesmo valor: é essa igualdade que faz o dedup enxergar o que o CSV já
        // subiu e não importar a mesma venda duas vezes (a taxa da maquininha
        // sairia dobrada no /financeiro). O código de autorização de 6 dígitos
        // continua em `autorizacao` e em rawData.
        nsu: venda.id || undefined,
        autorizacao: d.card_transaction.authorization_code || undefined,
        dataTransacao: dataBrt(venda.created_at),
        valorBruto: venda.amount / 100,
        // Líquido ausente não pode derrubar o lote inteiro com NaN: grava sem.
        valorLiquido: d.net_amount != null ? d.net_amount / 100 : undefined,
        parcelas: venda.installments || 1,
        tipo,
        status: 'aprovado',
        rawData: {
          id: venda.id,
          authorization_code: d.card_transaction.authorization_code ?? null,
          serial_number: venda.origin?.serial_number ?? d.origin?.serial_number ?? null,
          card_brand: venda.card_brand ?? null,
          mdr_amount: d.card_transaction.mdr_amount ?? null,
          origin_type: venda.origin?.type ?? null,
        },
      }
    })
}
