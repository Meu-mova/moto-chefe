import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { conciliacoesCartao } from '@/lib/db/schema'
import { INICIO_CONCILIACAO } from '@/lib/conciliacao-periodo'

type Executor = Pick<typeof db, '$count'>

/** Pendências de cartão do grupo, com o mesmo corte e o mesmo grupo da tela /conciliacao. */
export function contarPendenciasCartao(grupoId: string, executor: Executor = db): Promise<number> {
  return executor.$count(conciliacoesCartao, and(
    eq(conciliacoesCartao.grupoId, grupoId),
    eq(conciliacoesCartao.conciliado, false),
    gte(conciliacoesCartao.dataTransacao, INICIO_CONCILIACAO),
  ))
}
