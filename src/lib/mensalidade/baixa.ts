import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { mensalidades } from '@/lib/db/schema'
import { ambienteConfere, decidirBaixa, type Pagamento } from '@/lib/mercadopago/webhook'

type Mensalidade = typeof mensalidades.$inferSelect
type Executor = Pick<typeof db, 'update'>

/**
 * Resultado da tentativa de baixa. `registro` é o que vai para o log do webhook e para
 * quem confere: nulo quando não há nada a anotar (pagou, ou pagamento ainda pendente).
 */
export type ResultadoBaixa = { acao: 'pagar' | 'ignorar' | 'erro'; registro: string | null }

/**
 * Dá baixa na mensalidade a partir de um pagamento consultado no Mercado Pago. Única
 * regra para o webhook e o "Conferir agora" do admin.
 */
export async function aplicarBaixa(pg: Pagamento, m: Mensalidade | null, producao: boolean, exec: Executor = db): Promise<ResultadoBaixa> {
  if (!ambienteConfere(pg.live_mode, producao)) return { acao: 'erro', registro: 'live_mode do pagamento diferente do ambiente' }
  const baixa = decidirBaixa(pg, m ? { status: m.status, valorDevido: Number(m.valor) + Number(m.acrescimo) } : null)
  if (baixa.acao === 'erro') return { acao: 'erro', registro: baixa.motivo }
  if (baixa.acao === 'ignorar' || !m) return { acao: 'ignorar', registro: null }
  const baixadas = await exec.update(mensalidades)
    .set({ status: 'paga', pagoEm: new Date(), mpPaymentId: String(pg.id) })
    .where(and(eq(mensalidades.id, m.id), eq(mensalidades.status, 'aberta'), isNull(mensalidades.pagoEm)))
    .returning({ id: mensalidades.id })
  if (baixadas.length === 0) return { acao: 'ignorar', registro: 'mensalidade já baixada por outra notificação' }
  return { acao: 'pagar', registro: null }
}
