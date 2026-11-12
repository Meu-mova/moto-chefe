import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { certificateMatchesGroup } from '@/lib/certificado-grupo'

type Executor = Pick<typeof db, 'select'>

export async function certificateIsAllowedForGroup(
  certificateCnpj: string,
  group: { id: string; cnpj: string; contaId: string },
  exec: Executor = db,
): Promise<boolean> {
  const accountGroups = await exec.select({ id: grupos.id, cnpj: grupos.cnpj }).from(grupos).where(eq(grupos.contaId, group.contaId))
  if (!accountGroups.some(candidate => candidate.id === group.id)) return false
  return certificateMatchesGroup(certificateCnpj, group.cnpj, accountGroups.map(candidate => candidate.cnpj))
}
