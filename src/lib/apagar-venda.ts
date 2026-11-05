/**
 * Apaga uma venda de moto e o que depende dela. Hoje serve ao "Cancelar venda"; o "Remover moto"
 * (ADR-0020) reusa, para as duas não divergirem nem deixarem dado pessoal no Storage.
 */
import { eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { conciliacoesCartao, demandas, documentosAssinatura, lancamentosCaixa, pixRecebimentosMcp, vendas } from '@/lib/db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type VendaApagada = {
  desvinculados: { cartao: number; pix: number; demandas: number; valor: number; documentosAssinados: number }
  /** Caminhos no bucket `assinaturas`, para apagar DEPOIS do commit (ver apagarArquivosAssinatura). */
  arquivosAssinatura: string[]
}

export function caminhosDosArquivos(docs: { selfiePath: string | null; assinaturaPath: string | null }[]): string[] {
  return docs.flatMap(d => [d.selfiePath, d.assinaturaPath].filter((p): p is string => !!p))
}

const somaValores = (linhas: { valor: string | number }[]) => linhas.reduce((a, l) => a + Number(l.valor), 0)

/**
 * Apaga a venda dentro da transação recebida. NÃO confere a Conta: quem chama TEM de ter buscado
 * a venda com a Conta e o alcance do usuário no where (como `vendaDoUsuario`) e travado a NF antes.
 * Moto, pedido e histórico ficam com quem chama: cancelar e remover tratam cada um de um jeito.
 */
export async function apagarVendaTx(tx: Tx, vendaId: string): Promise<VendaApagada> {
  // conciliacoes_cartao, pix_recebimentos_mcp e demandas apontam para a venda com ON DELETE NO
  // ACTION: sem soltar antes, o DELETE estoura a FK. Os recebimentos voltam a ficar sem dono em
  // /conciliacao e /pix-mcp, porque o dinheiro entrou e continua no extrato.
  const cartoes = await tx.update(conciliacoesCartao)
    .set({ vendaId: null, conciliado: false, conciliadoEm: null })
    .where(eq(conciliacoesCartao.vendaId, vendaId))
    .returning({ valor: conciliacoesCartao.valorBruto })

  const pix = await tx.update(pixRecebimentosMcp)
    .set({
      vendaId: null, tipoCorrespondencia: null, osId: null,
      pedidoId: null, pecaVendaId: null, lancadoPorId: null, lancadoEm: null,
    })
    .where(eq(pixRecebimentosMcp.vendaId, vendaId))
    .returning({ valor: pixRecebimentosMcp.valor })

  const dems = await tx.update(demandas)
    .set({ vendaId: null })
    .where(eq(demandas.vendaId, vendaId))
    .returning({ id: demandas.id })

  await tx.delete(lancamentosCaixa).where(eq(lancamentosCaixa.vendaId, vendaId))

  // O contrato perde objeto com a venda. Eventos e códigos saem por ON DELETE CASCADE; a contagem
  // dos assinados volta para quem chama registrar, e um contrato assinado nunca some calado.
  const docs = await tx.delete(documentosAssinatura)
    .where(eq(documentosAssinatura.vendaId, vendaId))
    .returning({
      status: documentosAssinatura.status,
      selfiePath: documentosAssinatura.selfiePath,
      assinaturaPath: documentosAssinatura.assinaturaPath,
    })

  await tx.delete(vendas).where(eq(vendas.id, vendaId))

  return {
    desvinculados: {
      cartao: cartoes.length,
      pix: pix.length,
      demandas: dems.length,
      valor: somaValores(cartoes) + somaValores(pix),
      documentosAssinados: docs.filter(d => d.status === 'assinado').length,
    },
    arquivosAssinatura: caminhosDosArquivos(docs),
  }
}
