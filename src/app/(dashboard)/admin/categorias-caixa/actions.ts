'use server'
import { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
}

export async function listarCategoriasCaixaAction() {
  return db
    .select()
    .from(categoriasCaixa)
    .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome))
}

export async function criarCategoriaAction(dados: { nome: string; tipo: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!['entrada', 'saida', 'ambos'].includes(dados.tipo)) throw new Error('Tipo inválido')

  await db.insert(categoriasCaixa).values({
    nome: dados.nome.trim(),
    tipo: dados.tipo,
  })
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function editarCategoriaAction(id: string, dados: { nome: string; tipo: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!['entrada', 'saida', 'ambos'].includes(dados.tipo)) throw new Error('Tipo inválido')

  await db
    .update(categoriasCaixa)
    .set({ nome: dados.nome.trim(), tipo: dados.tipo })
    .where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function excluirCategoriaAction(id: string) {
  await requireAdmin()
  await db.delete(categoriasCaixa).where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db
    .update(categoriasCaixa)
    .set({ ativo })
    .where(eq(categoriasCaixa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/caixa')
}

export async function listarCategoriasDespesaAction() {
  return db
    .select()
    .from(categoriasDespesa)
    .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
}

export async function criarCategoriaDespesaAction(dados: { nome: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')

  await db.insert(categoriasDespesa).values({
    nome: dados.nome.trim(),
  })
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function editarCategoriaDespesaAction(id: string, dados: { nome: string }) {
  await requireAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')

  await db
    .update(categoriasDespesa)
    .set({ nome: dados.nome.trim() })
    .where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function excluirCategoriaDespesaAction(id: string) {
  await requireAdmin()
  await db.delete(categoriasDespesa).where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

export async function toggleAtivoDespesaAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db
    .update(categoriasDespesa)
    .set({ ativo })
    .where(eq(categoriasDespesa.id, id))
  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}
