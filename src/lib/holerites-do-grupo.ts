import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { holerites, lojas, usuarios } from '@/lib/db/schema'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select' | 'delete'>

// Lojas do grupo como subconsulta: o grupo ativo entra dentro de cada consulta.
const lojasDoGrupo = (grupoId: string, exec: Pick<typeof db, 'select'>) =>
  exec.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, grupoId))

// Leituras de holerite pelo id, com o grupo ativo DENTRO da consulta: registro de
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
export async function funcionarioDoGrupo(grupoId: string, usuarioId: string, exec: Executor = db) {
  const [alvo] = await exec
    .select({ lojaId: usuarios.lojaId, nome: usuarios.nome })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), inArray(usuarios.lojaId, lojasDoGrupo(grupoId, exec))))
    .limit(1)
  return alvo ?? null
}

/** Caminho do arquivo do holerite do grupo, ou null. */
export async function holeriteDoGrupo(grupoId: string, id: string, exec: Executor = db) {
  const [row] = await exec
    .select({ arquivoPath: holerites.arquivoPath })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(and(eq(holerites.id, id), inArray(usuarios.lojaId, lojasDoGrupo(grupoId, exec))))
    .limit(1)
  return row ?? null
}

/** Apaga a linha do holerite do grupo e devolve o caminho do arquivo; null se não é do grupo. */
export async function removerHoleriteDoGrupo(grupoId: string, id: string, exec: Executor = db) {
  const [row] = await exec
    .delete(holerites)
    .where(and(
      eq(holerites.id, id),
      inArray(holerites.usuarioId, exec.select({ id: usuarios.id }).from(usuarios)
        .where(inArray(usuarios.lojaId, lojasDoGrupo(grupoId, exec)))),
    ))
    .returning({ arquivoPath: holerites.arquivoPath })
  return row?.arquivoPath ?? null
}

/** Holerites do mês dos funcionários do grupo, com o nome de quem enviou. O nome só vem de usuário
 *  da Conta do grupo (ou admin_geral, da plataforma): quem enviou pode estar em outro grupo da Conta. */
export async function listarHoleritesDoGrupo(grupo: { id: string; contaId: string }, mes: string, exec: Executor = db) {
  const grupoId = grupo.id
  const rows = await exec
    .select({
      id: holerites.id,
      usuarioId: holerites.usuarioId,
      mes: holerites.mes,
      tipo: holerites.tipo,
      arquivoNome: holerites.arquivoNome,
      tamanho: holerites.tamanho,
      enviadoEm: holerites.enviadoEm,
      enviadoPorId: holerites.enviadoPor,
    })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(and(eq(holerites.mes, mes), inArray(usuarios.lojaId, lojasDoGrupo(grupoId, exec))))

  // Nome de quem enviou vem de uma segunda consulta em vez de um segundo join na
  // mesma tabela: são poucas linhas por mês e o alias deixaria a query bem menos
  // legível do que este de-para.
  const enviantes = [...new Set(rows.map(r => r.enviadoPorId).filter((id): id is string => !!id))]
  const nomePorId = new Map<string, string>()
  if (enviantes.length > 0) {
    const pessoas = await exec
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(
        inArray(usuarios.id, enviantes),
        or(
          eq(usuarios.contaId, grupo.contaId),
          inArray(usuarios.lojaId, lojasDaConta(grupo.contaId)),
          eq(usuarios.papel, 'admin_geral'),
        ),
      ))
    for (const p of pessoas) nomePorId.set(p.id, p.nome)
  }

  return rows.map(({ enviadoPorId, ...r }) => ({
    ...r,
    enviadoPorNome: enviadoPorId ? (nomePorId.get(enviadoPorId) ?? null) : null,
  }))
}
