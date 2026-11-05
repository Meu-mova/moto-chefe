import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, usuariosDados } from '@/lib/db/schema'
import {
  ERRO_FUNCIONARIO_NAO_ENCONTRADO, normalizarChavePix, recusaCorrecaoPix, validarPix, type TipoChavePix,
} from '@/lib/dados-funcionario'

type Executor = Pick<typeof db, 'select'>
type ExecutorGravacao = Pick<typeof db, 'select' | 'update'>

/** contaId nulo = admin_geral, que vê e corrige todas as Contas. */
type Editor = { papel: string; contaId: string | null }

const daConta = (contaId: string | null) => (contaId ? eq(usuarios.contaId, contaId) : undefined)

// Lista de /admin/dados-funcionarios. contaId nulo = admin_geral, que vê todas as Contas;
// o sócio vê a Conta inteira, não só o grupo ativo (#320, ADR-0018).
// Sem next/headers, para ser testado contra o banco.
export async function listarDadosFuncionarios(contaId: string | null, exec: Executor = db) {
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
    .where(daConta(contaId))
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
  // Falha fechado: só o admin_geral fica sem filtro de Conta.
  if (editor.papel !== 'admin_geral' && !editor.contaId) return naoEncontrado

  const [alvo] = await exec
    .select({ papel: usuarios.papel, temDados: usuariosDados.usuarioId })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .where(and(eq(usuarios.id, usuarioId), daConta(editor.contaId)))
    .limit(1)
  if (!alvo) return naoEncontrado

  const recusa = recusaCorrecaoPix(editor, { papel: alvo.papel, temDados: alvo.temDados !== null })
    ?? validarPix(pix.tipo, pix.chave)
  if (recusa) return { ok: false, erro: recusa }

  const tipo = pix.tipo as TipoChavePix
  const daContaDoEditor = editor.contaId
    ? inArray(usuariosDados.usuarioId, exec.select({ id: usuarios.id }).from(usuarios).where(daConta(editor.contaId)))
    : undefined
  await exec.update(usuariosDados)
    .set({ pixTipo: tipo, pixChave: normalizarChavePix(tipo, pix.chave), atualizadoEm: new Date() })
    .where(and(eq(usuariosDados.usuarioId, usuarioId), daContaDoEditor))
  return { ok: true }
}
