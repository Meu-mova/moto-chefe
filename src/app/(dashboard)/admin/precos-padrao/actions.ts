'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { carregarTabelaPadrao, preencherTodosComPrecoPadrao } from '@/lib/tabela-preco-padrao'
import { ehMatrizDePlanilha } from '@/lib/planilha-precos'

// A tabela é da plataforma: só quem tem o papel admin_geral carrega (soAdminGeral na navegação).
export async function carregarTabelaPadraoAction(matriz: unknown, competencia: unknown, confirmarQueda = false) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') return { ok: false as const, erro: 'Sem permissão' }
  if (!ehMatrizDePlanilha(matriz) || typeof competencia !== 'string') return { ok: false as const, erro: 'Planilha ilegível' }
  const r = await carregarTabelaPadrao({ matriz, competencia, usuarioId: usuario.id, confirmarQueda: confirmarQueda === true })
  if (!r.ok) return r
  // Só preenche modelo sem preço; o que os grupos já têm fica como está (#522).
  const preenchidos = await preencherTodosComPrecoPadrao()
  revalidatePath('/admin/precos-padrao')
  revalidatePath('/precificacao')
  return { ...r, preenchidos }
}
