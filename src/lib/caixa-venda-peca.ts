import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { lancamentosCaixa } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Dinheiro da venda de peças entra no caixa da loja da venda, como moto e OS (#546).
 * Refaz do zero: apaga as entradas da venda e recria pelos pagamentos atuais, então
 * editar não duplica nem deixa resíduo. Cartão, PIX e transferência ficam na
 * Conciliação. Venda sem `caixaAutomatico` (anterior à #546) nunca ganha entrada: a
 * loja lançou à mão.
 */
export async function sincronizarCaixaDaVendaPeca(
  tx: Tx,
  venda: { id: string; numero: number; lojaId: string; dataVenda: Date; caixaAutomatico: boolean },
  pagamentos: { tipo: string; valor: number }[],
  usuarioId: string,
): Promise<void> {
  if (!venda.caixaAutomatico) return
  await tx.delete(lancamentosCaixa)
    .where(and(eq(lancamentosCaixa.vendaPecaId, venda.id), eq(lancamentosCaixa.tipo, 'entrada')))
  // Dia da venda em Brasília, não o da edição: a entrada fica no fechamento certo.
  const data = hojeBrt(venda.dataVenda)
  for (const p of pagamentos.filter(p => p.tipo === 'dinheiro')) {
    await tx.insert(lancamentosCaixa).values({
      lojaId: venda.lojaId,
      usuarioId,
      tipo: 'entrada',
      categoria: 'Venda de peças',
      descricao: `Venda de peças #${venda.numero} dinheiro`,
      valor: Number(p.valor).toFixed(2),
      data,
      vendaPecaId: venda.id,
    })
  }
}
