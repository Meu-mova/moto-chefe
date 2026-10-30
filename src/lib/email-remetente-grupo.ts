import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

/**
 * Nome do remetente dos e-mails de assinatura da venda: o do grupo da loja do
 * documento (#542). Nulo = quem envia usa o nome do EMAIL_FROM ("MOVA").
 */
export async function nomeRemetenteDoGrupo(grupoId: string | null | undefined, exec: Executor = db): Promise<string | null> {
  if (!grupoId) return null
  const [g] = await exec.select({ nome: grupos.emailRemetenteNome }).from(grupos)
    .where(eq(grupos.id, grupoId)).limit(1)
  return g?.nome?.trim() || null
}
