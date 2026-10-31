import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas, notasFiscaisSaida } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'

type Executor = Pick<typeof db, 'select'>

/**
 * NF de saída que o usuário pode ver, ou null. A Conta entra no where (grupo da nota);
 * o grupo vem depois, no podeVerGrupo (a mesma regra do podeUsuarioVerGrupo). Nota de
 * outra Conta volta null, igual a nota inexistente: quem chama responde "Nota não
 * encontrada" nos dois casos (#404).
 *
 * A permissão é no grupo da loja da venda: a nota pode ter saído pelo grupo que
 * comprou a moto (#552), que é sempre da mesma Conta.
 */
export async function notaSaidaDoUsuario(
  usuario: { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null; grupoLiberado?: string | null },
  notaId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId
      ? inArray(notasFiscaisSaida.grupoId, exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.contaId, usuario.contaId)))
      : null
  if (daConta === null) return null
  const [linha] = await exec.select({
    nota: notasFiscaisSaida, grupoContaId: grupos.contaId,
    // Grupo da loja da venda só se for da mesma Conta da nota; senão, o da nota.
    grupoDaVenda: sql<string>`coalesce((select l.grupo_id from vendas v join lojas l on l.id = v.loja_id join grupos g on g.id = l.grupo_id
      where v.id = ${notasFiscaisSaida.vendaId} and g.conta_id = ${grupos.contaId}), ${notasFiscaisSaida.grupoId})`,
  })
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
    { id: linha.grupoDaVenda, contaId: linha.grupoContaId },
  )
  return pode ? linha.nota : null
}
