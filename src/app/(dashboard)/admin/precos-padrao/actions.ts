'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { carregarTabelaPadrao } from '@/lib/tabela-preco-padrao'

// A tabela é da plataforma: só quem tem o papel admin_geral carrega (soAdminGeral na navegação).
export async function carregarTabelaPadraoAction(matriz: unknown[][], competencia: string) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') return { ok: false as const, erro: 'Sem permissão' }
  const r = await carregarTabelaPadrao({ matriz, competencia, usuarioId: usuario.id })
  if (r.ok) revalidatePath('/admin/precos-padrao')
  return r
}
