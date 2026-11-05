import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lojas, usuarios, usuariosDados } from '@/lib/db/schema'
import { usuarioDoGrupo } from '@/lib/usuarios-do-grupo'
import {
  ERRO_FUNCIONARIO_NAO_ENCONTRADO, normalizarChavePix, recusaCorrecaoPix, validarPix, type TipoChavePix,
} from '@/lib/dados-funcionario'

type Executor = Pick<typeof db, 'select'>
type ExecutorGravacao = Pick<typeof db, 'select' | 'update'>

/** grupoId = grupo ativo de quem corrige. Vale para todos os papéis, inclusive admin_geral. */
type Editor = { papel: string; grupoId: string }

// Lista de /admin/dados-funcionarios: só o grupo ativo, para sócio e admin_geral. CPF e PIX
// não aparecem por Conta inteira (decisão do Cesar, 05/11/2026; antes valia a Conta, #320).
// Sem next/headers, para ser testado contra o banco.
export async function listarDadosFuncionarios(grupoId: string, exec: Executor = db) {
  return exec
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      papel: usuarios.papel,
      cpf: usuariosDados.cpf,
      pixTipo: usuariosDados.pixTipo,
      pixChave: usuariosDados.pixChave,
      dataNascimento: usuariosDados.dataNascimento,
    })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .leftJoin(lojas, eq(lojas.id, usuarios.lojaId))
    .where(usuarioDoGrupo(grupoId))
    .orderBy(asc(usuarios.nome))
}

// O admin corrige só o PIX (#680); CPF e nascimento continuam com o próprio funcionário.
export async function corrigirPixDoFuncionario(
  editor: Editor,
  usuarioId: string,
  pix: { tipo: string; chave: string },
  exec: ExecutorGravacao = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const naoEncontrado = { ok: false as const, erro: ERRO_FUNCIONARIO_NAO_ENCONTRADO }
  const [alvo] = await exec
    .select({ papel: usuarios.papel, temDados: usuariosDados.usuarioId })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .leftJoin(lojas, eq(lojas.id, usuarios.lojaId))
    .where(and(eq(usuarios.id, usuarioId), usuarioDoGrupo(editor.grupoId)))
    .limit(1)
  if (!alvo) return naoEncontrado

  const recusa = recusaCorrecaoPix(editor, { papel: alvo.papel, temDados: alvo.temDados !== null })
    ?? validarPix(pix.tipo, pix.chave)
  if (recusa) return { ok: false, erro: recusa }

  const tipo = pix.tipo as TipoChavePix
  const doGrupoDoEditor = inArray(usuariosDados.usuarioId, exec.select({ id: usuarios.id }).from(usuarios)
    .leftJoin(lojas, eq(lojas.id, usuarios.lojaId)).where(usuarioDoGrupo(editor.grupoId)))
  // O grupo vai de novo no update: o funcionário pode ter mudado de grupo depois da leitura.
  const gravadas = await exec.update(usuariosDados)
    .set({ pixTipo: tipo, pixChave: normalizarChavePix(tipo, pix.chave), atualizadoEm: new Date() })
    .where(and(eq(usuariosDados.usuarioId, usuarioId), doGrupoDoEditor))
    .returning({ usuarioId: usuariosDados.usuarioId })
  return gravadas.length ? { ok: true } : naoEncontrado
}
