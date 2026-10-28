import { and, eq, ilike, or, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { conciliacoesCartao, grupos } from '@/lib/db/schema'
import { padraoNsuDoTerminal } from '@/lib/conciliacao-terminal'

/**
 * Grupos da Conta em que o terminal (serial da maquininha) já apareceu na conciliação (#460).
 * Terminal visto só em outra Conta volta vazio, como desconhecido.
 */
export async function gruposDoTerminalNaConta(exec: Pick<typeof db, 'selectDistinct'>, contaId: string, terminal: string): Promise<string[]> {
  const linhas = await exec
    .selectDistinct({ grupoId: conciliacoesCartao.grupoId })
    .from(conciliacoesCartao)
    .innerJoin(grupos, eq(conciliacoesCartao.grupoId, grupos.id))
    .where(and(
      eq(grupos.contaId, contaId),
      or(
        ilike(conciliacoesCartao.nsu, padraoNsuDoTerminal(terminal)),
        eq(sql`${conciliacoesCartao.rawData}->>'serial'`, terminal),
      ),
    ))
  return linhas.map(l => l.grupoId)
}
