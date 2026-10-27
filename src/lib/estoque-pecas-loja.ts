/**
 * Estoque de peças por loja (#195): o catálogo é da Conta, o saldo é de cada loja.
 * Sem linha = saldo zero. Unidades inteiras. O saldo pode ficar negativo: estoque não barra venda (decisão
 * do Cesar, 31/08/2026). Toda leitura e gravação só casa peça e loja da mesma Conta.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { pecasEstoqueLoja } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'insert'>

// A linha (peça, loja) só sai se a loja é da Conta da peça.
const pecaELojaDaMesmaConta = (pecaId: string, lojaId: string, quantidade: number) => sql`
  select p.id, l.id, ${String(quantidade)}::integer, now()
    from pecas_catalogo p
    join lojas l on l.id = ${lojaId}
    join grupos g on g.id = l.grupo_id and g.conta_id = p.conta_id
   where p.id = ${pecaId}`

export async function saldoNaLoja(exec: Executor, pecaId: string, lojaId: string): Promise<number> {
  const [linha] = await exec.select({ quantidade: pecasEstoqueLoja.quantidade }).from(pecasEstoqueLoja)
    .where(and(
      eq(pecasEstoqueLoja.pecaId, pecaId),
      eq(pecasEstoqueLoja.lojaId, lojaId),
      sql`exists (select 1 from pecas_catalogo p join lojas l on l.id = ${lojaId}
        join grupos g on g.id = l.grupo_id and g.conta_id = p.conta_id where p.id = ${pecaId})`,
    ))
  return linha ? Number(linha.quantidade) : 0
}

/**
 * Soma `delta` ao saldo da peça na loja (negativo baixa). Incremento relativo: duas
 * linhas da mesma peça no carrinho somam as duas. Peça de outra Conta não grava nada.
 */
export async function moverSaldo(exec: Executor, pecaId: string, lojaId: string, delta: number) {
  await exec.insert(pecasEstoqueLoja)
    .select(pecaELojaDaMesmaConta(pecaId, lojaId, delta))
    .onConflictDoUpdate({
      target: [pecasEstoqueLoja.pecaId, pecasEstoqueLoja.lojaId],
      set: { quantidade: sql`${pecasEstoqueLoja.quantidade} + excluded.quantidade`, atualizadoEm: sql`now()` },
    })
}

/**
 * Ajuste manual: o saldo da peça na loja passa a ser `quantidade`. `false` se peça e
 * loja não são da mesma Conta; quem chama responde como peça inexistente.
 */
export async function definirSaldo(exec: Executor, pecaId: string, lojaId: string, quantidade: number): Promise<boolean> {
  const gravadas = await exec.insert(pecasEstoqueLoja)
    .select(pecaELojaDaMesmaConta(pecaId, lojaId, quantidade))
    .onConflictDoUpdate({
      target: [pecasEstoqueLoja.pecaId, pecasEstoqueLoja.lojaId],
      set: { quantidade: sql`excluded.quantidade`, atualizadoEm: sql`now()` },
    })
    .returning({ pecaId: pecasEstoqueLoja.pecaId })
  return gravadas.length > 0
}
