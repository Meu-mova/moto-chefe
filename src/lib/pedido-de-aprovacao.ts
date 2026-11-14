import { eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { aprovacoesVenda, historicoEstoque, motos } from '@/lib/db/schema'
import type { TipoAprovacaoVenda } from '@/lib/aprovacao-venda'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Grava o pedido de aprovação de uma venda de moto (Vender ou pedido, #776) e põe a moto em
 * "aguardando aprovação". A recusa devolve a disponibilidade anterior. A moto já vem travada
 * por quem chama, que também conferiu Conta, permissão e pagamentos.
 */
export async function gravarPedidoDeAprovacaoTx(tx: Tx, d: {
  origem: 'moto' | 'pedido'
  moto: { id: string; lojaId: string; disponibilidade: (typeof motos.$inferSelect)['disponibilidade'] }
  vendedorId: string
  solicitadoPor: string
  valor: string
  dadosVenda: unknown
  tipo: TipoAprovacaoVenda
  motivo: string
  /** Só no valor mínimo: os dois lados da conta, congelados (precificação muda; migração 0065). */
  snapshot: { valorMinimo: number; liquido: number } | null
  observacao: string
}) {
  await tx.insert(aprovacoesVenda).values({
    origem: d.origem,
    motoId: d.moto.id,
    lojaId: d.moto.lojaId,
    vendedorId: d.vendedorId,
    valor: d.valor,
    dadosVenda: d.dadosVenda,
    motivo: d.motivo,
    tipo: d.tipo,
    disponibilidadeAnterior: d.moto.disponibilidade,
    status: 'pendente',
    valorMinimoSnapshot: d.snapshot?.valorMinimo.toFixed(2) ?? null,
    liquidoSnapshot: d.snapshot?.liquido.toFixed(2) ?? null,
  })
  await tx.update(motos).set({ disponibilidade: 'aguardando_aprovacao' }).where(eq(motos.id, d.moto.id))
  await tx.insert(historicoEstoque).values({
    motoId: d.moto.id,
    lojaOrigemId: d.moto.lojaId,
    usuarioId: d.solicitadoPor,
    tipo: 'mudanca_status',
    referenciaTipo: 'aprovacao_venda',
    observacao: d.observacao,
  })
}
