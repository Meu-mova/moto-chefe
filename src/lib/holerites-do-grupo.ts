import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { holerites, usuarios } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'delete'>

// Leituras de holerite pelo id. Sem next/headers nem Storage, para rodar contra o banco.
// `lojaIdsGrupo` são as lojas do grupo ativo; quem chama decide a frase de recusa.

/** Funcionário do grupo, ou null (inexistente e de outro grupo são iguais para quem chama). */
export async function funcionarioDoGrupo(lojaIdsGrupo: string[], usuarioId: string, exec: Executor = db) {
  const [alvo] = await exec
    .select({ lojaId: usuarios.lojaId, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!alvo?.lojaId || !lojaIdsGrupo.includes(alvo.lojaId)) return null
  return alvo
}

/** Caminho do arquivo do holerite do grupo, ou null. */
export async function holeriteDoGrupo(lojaIdsGrupo: string[], id: string, exec: Executor = db) {
  const [row] = await exec
    .select({ arquivoPath: holerites.arquivoPath, lojaId: usuarios.lojaId })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(eq(holerites.id, id))
    .limit(1)
  if (!row?.lojaId || !lojaIdsGrupo.includes(row.lojaId)) return null
  return { arquivoPath: row.arquivoPath }
}

/** Apaga a linha do holerite do grupo e devolve o caminho do arquivo; null se não é do grupo. */
export async function removerHoleriteDoGrupo(lojaIdsGrupo: string[], id: string, exec: Executor = db) {
  const row = await holeriteDoGrupo(lojaIdsGrupo, id, exec)
  if (!row) return null
  await exec.delete(holerites).where(eq(holerites.id, id))
  return row.arquivoPath
}
