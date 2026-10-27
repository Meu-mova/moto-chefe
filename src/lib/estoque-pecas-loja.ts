/**
 * Estoque de peças por loja (#195): o catálogo é da Conta, o saldo é de cada loja.
 * Sem linha = saldo zero. O saldo pode ficar negativo: estoque não barra venda (decisão
 * do Cesar, 31/08/2026).
 */
import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { pecasEstoqueLoja } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'insert'>

export async function saldoNaLoja(exec: Executor, pecaId: string, lojaId: string): Promise<number> {
  const [linha] = await exec.select({ quantidade: pecasEstoqueLoja.quantidade }).from(pecasEstoqueLoja)
    .where(and(eq(pecasEstoqueLoja.pecaId, pecaId), eq(pecasEstoqueLoja.lojaId, lojaId)))
  return linha ? Number(linha.quantidade) : 0
}

/**
 * Soma `delta` ao saldo da peça na loja (negativo baixa). Incremento relativo, como a
 * coluna antiga: duas linhas da mesma peça no carrinho somam as duas. Peça de outra Conta
 * que não a da loja não grava nada.
 */
export async function moverSaldo(exec: Executor, pecaId: string, lojaId: string, delta: number) {
  await exec.insert(pecasEstoqueLoja)
    .select(sql`select p.id, l.id, ${String(delta)}::numeric, now()
      from pecas_catalogo p
      join lojas l on l.id = ${lojaId}
      join grupos g on g.id = l.grupo_id and g.conta_id = p.conta_id
      where p.id = ${pecaId}`)
    .onConflictDoUpdate({
      target: [pecasEstoqueLoja.pecaId, pecasEstoqueLoja.lojaId],
      set: {
        quantidade: sql`${pecasEstoqueLoja.quantidade} + excluded.quantidade`,
        atualizadoEm: sql`now()`,
      },
    })
}
