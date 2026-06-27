'use server'
import { db } from '@/lib/db'
import { comunicados, comunicadosLidos } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
  return u
}

export async function listarComunicadosAction() {
  await requireAdmin()
  return db
    .select({
      id: comunicados.id,
      titulo: comunicados.titulo,
      conteudo: comunicados.conteudo,
      ativo: comunicados.ativo,
      criadoEm: comunicados.criadoEm,
      totalLidos: sql<number>`(SELECT COUNT(*) FROM comunicados_lidos WHERE comunicado_id = ${comunicados.id})::int`,
    })
    .from(comunicados)
    .orderBy(sql`${comunicados.criadoEm} DESC`)
}

export async function criarComunicadoAction(dados: { titulo: string; conteudo: string; ativo: boolean }) {
  const u = await requireAdmin()
  if (!dados.titulo.trim()) throw new Error('Título obrigatório')
  if (!dados.conteudo.trim()) throw new Error('Conteúdo obrigatório')
  await db.insert(comunicados).values({
    titulo: dados.titulo.trim(),
    conteudo: dados.conteudo.trim(),
    ativo: dados.ativo,
    criadoPorId: u.id,
  })
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  await requireAdmin()
  await db.update(comunicados).set({ ativo }).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function excluirComunicadoAction(id: string) {
  await requireAdmin()
  await db.delete(comunicados).where(eq(comunicados.id, id))
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function marcarComoLidoAction(comunicadoId: string) {
  const u = await getUsuarioLogado()
  await db
    .insert(comunicadosLidos)
    .values({ comunicadoId, usuarioId: u.id })
    .onConflictDoNothing()
  revalidatePath('/', 'layout')
}

export async function buscarComunicadosNaoLidosAction() {
  const u = await getUsuarioLogado()
  return db
    .select({ id: comunicados.id, titulo: comunicados.titulo, conteudo: comunicados.conteudo })
    .from(comunicados)
    .where(
      and(
        eq(comunicados.ativo, true),
        sql`${comunicados.id} NOT IN (
          SELECT comunicado_id FROM comunicados_lidos WHERE usuario_id = ${u.id}
        )`
      )
    )
    .orderBy(comunicados.criadoEm)
}
