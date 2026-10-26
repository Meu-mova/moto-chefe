/**
 * Catálogo de peças por Conta (#195): as lojas da Conta compartilham o catálogo, as
 * outras Contas não leem nem alteram. O admin_geral vê e altera todas (decisão do Luis).
 * Venda e OS valem na Conta da LOJA do registro, não na de quem está logado.
 */
import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

/** `contaId` é a Conta do grupo ativo da sessão. */
export type QuemVePecas = { papel: string; contaId: string }

function daConta(quem: QuemVePecas): SQL | undefined {
  return quem.papel === 'admin_geral' ? undefined : eq(pecasCatalogo.contaId, quem.contaId)
}

// A coluna fica fora da subconsulta, então casa com pecas_catalogo e não com grupos.conta_id.
export function daContaDaLoja(lojaId: string): SQL {
  return sql`${pecasCatalogo.contaId} = (select g.conta_id from lojas l join grupos g on g.id = l.grupo_id where l.id = ${lojaId})`
}

export async function listarPecas(exec: Executor, quem: QuemVePecas, opcoes?: { apenasAtivos?: boolean }) {
  return exec.select().from(pecasCatalogo)
    .where(and(daConta(quem), opcoes?.apenasAtivos ? eq(pecasCatalogo.ativo, true) : undefined))
    .orderBy(asc(pecasCatalogo.nome))
}

export async function listarPecasDaLoja(exec: Executor, lojaId: string) {
  return exec.select().from(pecasCatalogo)
    .where(and(daContaDaLoja(lojaId), eq(pecasCatalogo.ativo, true)))
    .orderBy(asc(pecasCatalogo.nome))
}

export async function pecaUsavelNaLoja(exec: Executor, lojaId: string, pecaId: string): Promise<boolean> {
  const [peca] = await exec.select({ id: pecasCatalogo.id }).from(pecasCatalogo)
    .where(and(eq(pecasCatalogo.id, pecaId), daContaDaLoja(lojaId)))
    .limit(1)
  return !!peca
}

export async function inserirPeca(
  exec: Executor,
  contaId: string,
  input: { nome: string; valor: number; quantidadeEstoque: number },
) {
  const [nova] = await exec.insert(pecasCatalogo).values({
    nome: input.nome,
    valor: String(input.valor),
    quantidadeEstoque: input.quantidadeEstoque,
    contaId,
  }).returning({
    id: pecasCatalogo.id,
    nome: pecasCatalogo.nome,
    valor: pecasCatalogo.valor,
    quantidadeEstoque: pecasCatalogo.quantidadeEstoque,
  })
  return nova
}

/**
 * Altera a peça só se ela é da Conta de quem pede. `false` tanto para peça de outra
 * Conta quanto para id inexistente: quem chama responde a mesma frase nos dois casos.
 */
export async function alterarPeca(
  exec: Executor,
  quem: QuemVePecas,
  id: string,
  campos: { nome?: string; valor?: string; quantidadeEstoque?: number; ativo?: boolean },
): Promise<boolean> {
  const alteradas = await exec.update(pecasCatalogo)
    .set({ ...campos, atualizadoEm: new Date() })
    .where(and(eq(pecasCatalogo.id, id), daConta(quem)))
    .returning({ id: pecasCatalogo.id })
  return alteradas.length > 0
}
