import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas, notasFiscaisSaida } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'

type Executor = Pick<typeof db, 'select'>

/**
 * NF de saída que o usuário pode ver, ou null. A Conta entra no where (grupo da nota);
 * o grupo vem depois, no podeVerGrupo (a mesma regra do podeUsuarioVerGrupo). Nota de
 * outra Conta volta null, igual a nota inexistente: quem chama responde "Nota não
 * encontrada" nos dois casos (#404).
 */
export async function notaSaidaDoUsuario(
  usuario: { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null },
  notaId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId
      ? inArray(notasFiscaisSaida.grupoId, exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.contaId, usuario.contaId)))
      : null
  if (daConta === null) return null
  const [linha] = await exec.select({ nota: notasFiscaisSaida, grupoContaId: grupos.contaId })
    .from(notasFiscaisSaida)
    .innerJoin(grupos, eq(grupos.id, notasFiscaisSaida.grupoId))
    .where(and(eq(notasFiscaisSaida.id, notaId), daConta)).limit(1)
  if (!linha) return null
  const [propria] = usuario.lojaId
    ? await exec.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, usuario.lojaId)).limit(1)
    : []
  const pode = podeVerGrupo(
    { papel: usuario.papel, gruposAcesso: usuario.gruposAcesso ? [...usuario.gruposAcesso] : null, contaId: usuario.contaId },
    propria?.grupoId ?? null,
    { id: linha.nota.grupoId, contaId: linha.grupoContaId },
  )
  return pode ? linha.nota : null
}
