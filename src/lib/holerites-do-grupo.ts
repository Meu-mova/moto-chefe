import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { holerites, usuarios } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select' | 'delete'>

// Leituras de holerite pelo id, com as lojas do grupo ativo DENTRO da consulta: registro de
// outro grupo nem é lido. Sem next/headers nem Storage, para rodar contra o banco.
// Quem chama decide a frase de recusa, a mesma para inexistente e para outro grupo.

/** Caminho no bucket de um envio novo, montado do grupo no servidor. Os antigos (sem o grupo) seguem
 *  pelo `arquivo_path` gravado: abrir e remover nunca remontam o caminho. */
export function caminhoDoHolerite(
  { grupoId, mes, usuarioId, tipo }: { grupoId: string; mes: string; usuarioId: string; tipo: string },
  sufixo: string,
) {
  return `${grupoId}/${mes}/${usuarioId}-${tipo}-${sufixo}.pdf`
}

/** Funcionário do grupo, ou null. */
export async function funcionarioDoGrupo(lojaIdsGrupo: string[], usuarioId: string, exec: Executor = db) {
  const [alvo] = await exec
    .select({ lojaId: usuarios.lojaId, nome: usuarios.nome })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), inArray(usuarios.lojaId, lojaIdsGrupo)))
    .limit(1)
  return alvo ?? null
}

/** Caminho do arquivo do holerite do grupo, ou null. */
export async function holeriteDoGrupo(lojaIdsGrupo: string[], id: string, exec: Executor = db) {
  const [row] = await exec
    .select({ arquivoPath: holerites.arquivoPath })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(and(eq(holerites.id, id), inArray(usuarios.lojaId, lojaIdsGrupo)))
    .limit(1)
  return row ?? null
}

/** Apaga a linha do holerite do grupo e devolve o caminho do arquivo; null se não é do grupo. */
export async function removerHoleriteDoGrupo(lojaIdsGrupo: string[], id: string, exec: Executor = db) {
  const row = await holeriteDoGrupo(lojaIdsGrupo, id, exec)
  if (!row) return null
  await exec.delete(holerites).where(eq(holerites.id, id))
  return row.arquivoPath
}
