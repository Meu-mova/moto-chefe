'use server'
import { db } from '@/lib/db'
import { calendarioCategorias, calendarioEventos } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { CORES_KEYS } from '@/lib/calendario'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
  return u
}

function validarCor(cor: string): string {
  return (CORES_KEYS as string[]).includes(cor) ? cor : 'slate'
}

export async function criarCategoriaCalendarioAction(dados: { nome: string; cor: string }) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome obrigatório')

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${calendarioCategorias.ordem}), 0)::int` })
    .from(calendarioCategorias)
    .where(eq(calendarioCategorias.grupoId, grupo.id))

  await db.insert(calendarioCategorias).values({
    grupoId: grupo.id,
    nome: nome.slice(0, 100),
    cor: validarCor(dados.cor),
    ordem: (max ?? 0) + 1,
  })
  revalidatePath('/admin/calendario-categorias')
  revalidatePath('/calendario')
}

export async function editarCategoriaCalendarioAction(id: string, dados: { nome: string; cor: string }) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome obrigatório')

  await db.update(calendarioCategorias)
    .set({ nome: nome.slice(0, 100), cor: validarCor(dados.cor) })
    .where(and(eq(calendarioCategorias.id, id), eq(calendarioCategorias.grupoId, grupo.id)))
  revalidatePath('/admin/calendario-categorias')
  revalidatePath('/calendario')
}

export async function toggleAtivoCategoriaCalendarioAction(id: string, ativo: boolean) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  await db.update(calendarioCategorias)
    .set({ ativo })
    .where(and(eq(calendarioCategorias.id, id), eq(calendarioCategorias.grupoId, grupo.id)))
  revalidatePath('/admin/calendario-categorias')
  revalidatePath('/calendario')
}

export async function excluirCategoriaCalendarioAction(id: string) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)

  // Categoria em uso não pode ser apagada (FK) — orienta a desativar.
  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(calendarioEventos)
    .where(eq(calendarioEventos.categoriaId, id))
  if ((n ?? 0) > 0) throw new Error('Categoria em uso por eventos. Desative em vez de excluir.')

  await db.delete(calendarioCategorias)
    .where(and(eq(calendarioCategorias.id, id), eq(calendarioCategorias.grupoId, grupo.id)))
  revalidatePath('/admin/calendario-categorias')
  revalidatePath('/calendario')
}
