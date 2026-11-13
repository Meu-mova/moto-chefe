import { and, eq, ilike, or, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { conciliacoesCartao, grupos } from '@/lib/db/schema'
import { padraoNsuDoTerminal } from '@/lib/conciliacao-terminal'

/**
 * Grupos da Conta em que o terminal (serial da maquininha) já apareceu na conciliação (#460).
 * Terminal visto só em outra Conta volta vazio, como desconhecido.
 *
 * Na InfinityPay o serial vem embutido no NSU, então por padrão também se procura ali.
 * `soSerial` procura só em `rawData.serial`: o NSU da Cielo é o Código da venda (19 dígitos), e
 * um serial curto de só números casaria com o código de uma venda qualquer por acaso.
 */
export async function gruposDoTerminalNaConta(
  exec: Pick<typeof db, 'selectDistinct'>, contaId: string, terminal: string, { soSerial = false } = {},
): Promise<string[]> {
  const linhas = await exec
    .selectDistinct({ grupoId: conciliacoesCartao.grupoId })
    .from(conciliacoesCartao)
    .innerJoin(grupos, eq(conciliacoesCartao.grupoId, grupos.id))
    .where(and(
      eq(grupos.contaId, contaId),
      soSerial
        ? eq(sql`${conciliacoesCartao.rawData}->>'serial'`, terminal)
        : or(
            ilike(conciliacoesCartao.nsu, padraoNsuDoTerminal(terminal)),
            eq(sql`${conciliacoesCartao.rawData}->>'serial'`, terminal),
          ),
    ))
  return linhas.map(l => l.grupoId)
}
