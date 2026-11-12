'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { corrigirPixDoFuncionario } from '@/lib/dados-funcionarios'

export async function salvarPixDoFuncionarioAction(
  usuarioId: string,
  pixTipo: string,
  pixChave: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const editor = await getUsuarioLogado()
  if (!usuarioPodeAcessar(editor, '/admin/dados-funcionarios')) {
    return { ok: false, erro: 'Sem permissão para editar dados de funcionários.' }
  }

  const r = await corrigirPixDoFuncionario(
    { papel: editor.papel, grupoId: (await grupoAtivoDaRequisicao(editor)).id }, usuarioId, { tipo: pixTipo, chave: pixChave },
  )
  if (r.ok) revalidatePath('/admin/dados-funcionarios')
  return r
}
