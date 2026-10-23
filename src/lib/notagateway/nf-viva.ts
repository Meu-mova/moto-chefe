import { and, eq, notInArray } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { notasFiscaisSaida } from '@/lib/db/schema'
import { STATUS_MORTOS } from '@/lib/notagateway/status'

type Executor = Pick<typeof db, 'select'>

/** NF de saída de produção que ainda trava a venda (ADR-0014): autorizada, em emissão ou em cancelamento. */
export async function vendaTemNfViva(tx: Executor, vendaId: string): Promise<boolean> {
  const [viva] = await tx.select({ id: notasFiscaisSaida.id }).from(notasFiscaisSaida)
    .where(and(eq(notasFiscaisSaida.vendaId, vendaId), eq(notasFiscaisSaida.ambiente, 'Producao'), notInArray(notasFiscaisSaida.status, STATUS_MORTOS)))
    .limit(1)
  return !!viva
}
