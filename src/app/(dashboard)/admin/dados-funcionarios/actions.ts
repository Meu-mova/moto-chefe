'use server'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, usuariosDados } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { contaDoEditor } from '@/lib/grupo'
import {
  normalizarChavePix, podeEditarDadosDe, validarPix,
  type TipoChavePix,
} from '@/lib/dados-funcionario'

// O admin corrige só o PIX. CPF e nascimento continuam com o próprio
// funcionário, em /completar-cadastro.
export async function salvarPixDoFuncionarioAction(
  usuarioId: string,
  pixTipo: TipoChavePix,
  pixChave: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const editor = await getUsuarioLogado()
  if (!usuarioPodeAcessar(editor, '/admin/dados-funcionarios')) {
    return { ok: false, erro: 'Sem permissão para editar dados de funcionários.' }
  }

  // Mesma Conta que a página usa para listar (#320).
  const contaId = await contaDoEditor(editor)

  const [alvo] = await db
    .select({ contaId: usuarios.contaId, temDados: usuariosDados.usuarioId })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!alvo || !podeEditarDadosDe({ papel: editor.papel, contaId }, alvo)) return { ok: false, erro: 'Funcionário não encontrado.' }
  // CPF e nascimento são obrigatórios na linha; sem eles o funcionário ainda
  // não passou pelo primeiro acesso, e é lá que ele preenche tudo.
  if (!alvo.temDados) return { ok: false, erro: 'Esse funcionário ainda não preencheu os dados.' }

  const erroPix = validarPix(pixTipo, pixChave)
  if (erroPix) return { ok: false, erro: erroPix }

  await db.update(usuariosDados)
    .set({ pixTipo, pixChave: normalizarChavePix(pixTipo, pixChave), atualizadoEm: new Date() })
    .where(eq(usuariosDados.usuarioId, usuarioId))

  revalidatePath('/admin/dados-funcionarios')
  return { ok: true }
}
