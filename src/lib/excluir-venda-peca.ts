/**
 * Exclui a venda de peças: devolve o estoque dos itens e solta as transações de cartão/PIX
 * casadas com ela. A venda é buscada com a Conta no where (vendaPecaEditavel): venda de
 * outra Conta responde igual a venda inexistente.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { aprovacoesVenda, conciliacoesCartao, pixRecebimentosMcp, vendasPecas, vendasPecasItens } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'
import { vendaPecaEditavel, type UsuarioDaVenda } from '@/lib/venda-peca-editavel'
import { moverSaldo } from '@/lib/estoque-pecas-loja'

type Tx = Parameters<Parameters<typeof db['transaction']>[0]>[0]

export async function excluirVendaPecaTx(tx: Tx, usuario: UsuarioDaVenda & { id: string }, vendaId: string) {
  const venda = await vendaPecaEditavel(tx, usuario, vendaId, true)
  if (!venda) throw new RecusaUsuario('Venda não encontrada')

  // Pedido de edição pendente desta venda perde o objeto: recusa junto, senão ficaria
  // no painel de aprovações falhando com "venda não encontrada".
  await tx.update(aprovacoesVenda)
    .set({ status: 'recusada', respondidoPor: usuario.id, dataResposta: new Date() })
    .where(and(
      eq(aprovacoesVenda.origem, 'peca_edicao'),
      eq(aprovacoesVenda.status, 'pendente'),
      sql`${aprovacoesVenda.dadosVenda}->>'vendaId' = ${vendaId}`,
    ))

  const itens = await tx
    .select({ pecaId: vendasPecasItens.pecaId, quantidade: vendasPecasItens.quantidade })
    .from(vendasPecasItens)
    .where(eq(vendasPecasItens.vendaPecaId, vendaId))

  // Devolve na mesma forma que a venda baixou (incremento relativo) — duas linhas da
  // mesma peça no carrinho têm que somar as duas de volta.
  for (const item of itens) {
    await moverSaldo(tx, item.pecaId, venda.lojaId, Number(item.quantidade))
  }

  // Soltar antes do DELETE: as duas colunas são FK pra vendas_pecas e segurariam a
  // exclusão. Volta ao estado de transação não conciliada, como desvincular na mão.
  await tx.update(conciliacoesCartao)
    .set({ pecaVendaId: null, conciliado: false, conciliadoEm: null })
    .where(eq(conciliacoesCartao.pecaVendaId, vendaId))
  await tx.update(pixRecebimentosMcp)
    .set({ tipoCorrespondencia: null, pecaVendaId: null, lancadoPorId: null, lancadoEm: null })
    .where(eq(pixRecebimentosMcp.pecaVendaId, vendaId))

  await tx.delete(vendasPecasItens).where(eq(vendasPecasItens.vendaPecaId, vendaId))
  await tx.delete(vendasPecas).where(eq(vendasPecas.id, vendaId))
  return { numero: venda.numero }
}
