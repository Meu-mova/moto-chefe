/**
 * Aplica a edição de uma venda de peças (#242) dentro de uma transação: troca
 * itens e pagamentos no lugar (mesmo número), acerta o estoque pela diferença
 * e grava o histórico. Permissão e saneamento ficam na action, como na criação.
 */
import { conferirMaquininhas, operadorasGravadas } from '@/lib/maquininhas'
import { and, eq, inArray } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { lojas, pecasCatalogo, vendasPecas, vendasPecasEdicoes, vendasPecasItens } from '@/lib/db/schema'
import { diferencaDeEstoque, resumoDaEdicao } from './edicao-venda-peca'
import { RecusaUsuario } from '@/lib/resultado-action'
import { daContaDaLoja } from '@/lib/pecas-da-conta'
import { moverSaldo } from '@/lib/estoque-pecas-loja'
import { recusaDaQuantidadeVendida } from '@/lib/quantidade-vendida'
import { sincronizarCaixaDaVendaPeca } from '@/lib/caixa-venda-peca'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type EdicaoVendaPeca = {
  vendaId: string
  grupoId: string
  usuarioId: string
  /** `valorUnitario` só chega de gestor; sem ele vale o preço que a peça já tinha na venda, ou o do catálogo. */
  itens: { pecaId: string; quantidade: number; valorUnitario?: number }[]
  pagamentos: { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[]
}

export async function editarVendaPecaTx(tx: Tx, e: EdicaoVendaPeca) {
  const [venda] = await tx.select().from(vendasPecas).where(eq(vendasPecas.id, e.vendaId)).for('update')
  if (!venda) throw new RecusaUsuario('Venda não encontrada')

  const antigos = await tx.select().from(vendasPecasItens).where(eq(vendasPecasItens.vendaPecaId, e.vendaId))
  const precoAnterior = new Map(antigos.map(i => [i.pecaId, i.valorUnitario]))

  const pecas = await tx
    .select({ id: pecasCatalogo.id, nome: pecasCatalogo.nome, valor: pecasCatalogo.valor })
    .from(pecasCatalogo)
    // Só da Conta da loja da venda: peça de outra Conta cai no "Peça não encontrada" (#195).
    .where(and(
      inArray(pecasCatalogo.id, [...new Set([...e.itens.map(i => i.pecaId), ...antigos.map(i => i.pecaId)])]),
      daContaDaLoja(venda.lojaId),
    ))
    .for('update')
  const pecaById = new Map(pecas.map(p => [p.id, p]))
  // Também aqui, e não só na action: a edição aprovada aplica o que ficou guardado (#195).
  const recusaQuantidade = recusaDaQuantidadeVendida(e.itens)
  if (recusaQuantidade) throw new RecusaUsuario(recusaQuantidade)
  await conferirMaquininhas(tx, venda.lojaId, e.pagamentos, operadorasGravadas(venda.pagamentos))
  for (const item of e.itens) {
    const peca = pecaById.get(item.pecaId)
    if (!peca) throw new RecusaUsuario('Peça não encontrada')
    if (item.quantidade <= 0) throw new RecusaUsuario(`Quantidade inválida para ${peca.nome}`)
  }

  // Incremento relativo, como na venda e na exclusão: estoque pode ficar negativo.
  const delta = diferencaDeEstoque(
    antigos.map(i => ({ pecaId: i.pecaId, quantidade: Number(i.quantidade) })),
    e.itens,
  )
  for (const [pecaId, n] of delta) {
    await moverSaldo(tx, pecaId, venda.lojaId, -n)
  }

  const novos = e.itens.map(item => {
    const peca = pecaById.get(item.pecaId)!
    const valorUnitario = item.valorUnitario != null && item.valorUnitario >= 0
      ? item.valorUnitario.toFixed(2)
      : precoAnterior.get(item.pecaId) ?? peca.valor
    return { vendaPecaId: e.vendaId, pecaId: item.pecaId, descricao: peca.nome, quantidade: String(item.quantidade), valorUnitario }
  })
  await tx.delete(vendasPecasItens).where(eq(vendasPecasItens.vendaPecaId, e.vendaId))
  await tx.insert(vendasPecasItens).values(novos)

  const valorTotal = e.pagamentos.reduce((s, p) => s + p.valor, 0)
  const formaPagamento = e.pagamentos.length === 1 ? e.pagamentos[0].tipo : 'multiplo'
  await tx.update(vendasPecas)
    .set({ pagamentos: e.pagamentos, formaPagamento, valorTotal: valorTotal.toFixed(2) })
    .where(eq(vendasPecas.id, e.vendaId))
  await sincronizarCaixaDaVendaPeca(tx, venda, e.pagamentos, e.usuarioId)

  const antes = {
    itens: antigos.map(i => ({ pecaId: i.pecaId, descricao: i.descricao, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) })),
    pagamentos: venda.pagamentos ?? [],
    formaPagamento: venda.formaPagamento,
    valorTotal: Number(venda.valorTotal),
  }
  const depois = {
    itens: novos.map(i => ({ pecaId: i.pecaId, descricao: i.descricao, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) })),
    pagamentos: e.pagamentos,
    formaPagamento,
    valorTotal,
  }
  await tx.insert(vendasPecasEdicoes).values({
    grupoId: e.grupoId,
    vendaPecaId: e.vendaId,
    usuarioId: e.usuarioId,
    resumo: resumoDaEdicao(antes, depois),
    antes,
    depois,
  })

  return { numero: venda.numero }
}

/** O que fica guardado em `aprovacoes_venda.dados_venda` quando a edição pede aprovação (origem 'peca_edicao'). */
export type EdicaoPendente = {
  vendaId: string
  numero: number
  itens: EdicaoVendaPeca['itens']
  pagamentos: EdicaoVendaPeca['pagamentos']
}

/**
 * Aplica a edição que esperava aprovação (financiamento sem permissão). O grupo vem da
 * loja da venda, lido agora; o histórico fica em nome de quem pediu a edição — quem
 * aprovou está na própria aprovação.
 */
export async function aplicarEdicaoAprovadaTx(tx: Tx, e: EdicaoPendente, solicitanteId: string) {
  const [venda] = await tx
    .select({ grupoId: lojas.grupoId })
    .from(vendasPecas)
    .innerJoin(lojas, eq(lojas.id, vendasPecas.lojaId))
    .where(eq(vendasPecas.id, e.vendaId))
  if (!venda) throw new RecusaUsuario(`Venda não encontrada: a venda de peças #${e.numero} pode ter sido excluída`)
  return editarVendaPecaTx(tx, {
    vendaId: e.vendaId, grupoId: venda.grupoId, usuarioId: solicitanteId, itens: e.itens, pagamentos: e.pagamentos,
  })
}
