/**
 * Entrada de peças pela NF-e (#341, #426). Tudo é gravado na Conta da LOJA de destino,
 * nunca na que vier do payload. Quem chama confere que o usuário pode usar a loja
 * (resolverLojaDestino) e roda isto dentro da mesma transação das motos (#429).
 */
import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { grupos, lojas, notasEntrada, pecasCatalogo, pecasVinculoFornecedor } from '@/lib/db/schema'
import { inserirPeca, pecaUsavelNaLoja } from '@/lib/pecas-da-conta'
import { moverSaldo } from '@/lib/estoque-pecas-loja'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

export type LinhaEntradaPeca = {
  codigo: string
  nomeXml: string
  quantidade: number
  custoUnitario: number
} & ({ pecaId: string } | { nova: { nome: string; valor: number } })

export type EntradaPecas = {
  lojaId: string
  usuarioId: string
  nota: { chaveAcesso: string; numero: string; fornecedorCnpj: string }
  linhas: LinhaEntradaPeca[]
}

/** Entrada recusada; a transação desfaz tudo. A frase não revela dado de outra Conta. */
export class EntradaPecasRecusada extends Error {}

export async function gravarEntradaPecas(exec: Executor, entrada: EntradaPecas): Promise<void> {
  const [loja] = await exec.select({ grupoId: grupos.id, contaId: grupos.contaId })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(eq(lojas.id, entrada.lojaId))
  if (!loja) throw new EntradaPecasRecusada('Loja de destino não encontrada')
  const { contaId, grupoId } = loja

  for (const linha of entrada.linhas) {
    if (!Number.isInteger(linha.quantidade) || linha.quantidade <= 0) {
      throw new EntradaPecasRecusada('Quantidade de peça precisa ser um número inteiro maior que zero')
    }
    if ('nova' in linha && !(linha.nova.valor > 0)) {
      throw new EntradaPecasRecusada('Peça nova precisa de preço de venda')
    }
    if ('pecaId' in linha && !(await pecaUsavelNaLoja(exec, entrada.lojaId, linha.pecaId))) {
      throw new EntradaPecasRecusada('Peça não encontrada')
    }
    const pecaId = 'pecaId' in linha
      ? linha.pecaId
      : (await inserirPeca(exec, contaId, linha.nova)).id

    await exec.update(pecasCatalogo)
      .set({ custo: String(linha.custoUnitario), atualizadoEm: new Date() })
      .where(and(eq(pecasCatalogo.id, pecaId), eq(pecasCatalogo.contaId, contaId)))
    await moverSaldo(exec, pecaId, entrada.lojaId, linha.quantidade)
    await exec.insert(pecasVinculoFornecedor).values({
      contaId,
      fornecedorCnpj: entrada.nota.fornecedorCnpj,
      codigo: linha.codigo,
      nomeXml: linha.nomeXml,
      pecaId,
    }).onConflictDoUpdate({
      target: [pecasVinculoFornecedor.contaId, pecasVinculoFornecedor.fornecedorCnpj, pecasVinculoFornecedor.codigo, pecasVinculoFornecedor.nomeXml],
      set: { pecaId, atualizadoEm: sql`now()` },
      setWhere: eq(pecasVinculoFornecedor.contaId, contaId),
    })
  }

  await exec.insert(notasEntrada).values({
    contaId,
    grupoId,
    lojaId: entrada.lojaId,
    ...entrada.nota,
    criadoPor: entrada.usuarioId,
  })
}
