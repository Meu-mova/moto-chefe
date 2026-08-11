import { db } from '@/lib/db'
import { documentosAssinatura, vendas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { SituacaoNf } from './nf'

// Situação da venda para a trava de NF: existe contrato assinado? houve
// liberação de exceção?
export async function situacaoNfDaVenda(vendaId: string): Promise<SituacaoNf> {
  const [contrato] = await db
    .select({ id: documentosAssinatura.id })
    .from(documentosAssinatura)
    .where(and(
      eq(documentosAssinatura.vendaId, vendaId),
      eq(documentosAssinatura.tipo, 'contrato_venda'),
      eq(documentosAssinatura.status, 'assinado'),
    ))
    .limit(1)

  const [venda] = await db
    .select({ liberadaEm: vendas.nfLiberadaEm })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)

  return { contratoAssinado: !!contrato, liberadaEm: venda?.liberadaEm ?? null }
}
