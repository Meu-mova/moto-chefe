'use server'
import { db } from '@/lib/db'
import { comunicados, comunicadosLidos } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const u = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(u.papel)) throw new Error('Sem permissão')
  return u
}

export async function listarComunicadosAction() {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  return db
    .select({
      id: comunicados.id,
      titulo: comunicados.titulo,
      conteudo: comunicados.conteudo,
      ativo: comunicados.ativo,
      papeis: comunicados.papeis,
      dataPostagem: comunicados.dataPostagem,
      criadoEm: comunicados.criadoEm,
      totalLidos: sql<number>`(SELECT COUNT(*) FROM comunicados_lidos WHERE comunicado_id = ${comunicados.id})::int`,
    })
    .from(comunicados)
    .where(eq(comunicados.grupoId, grupo.id))
    .orderBy(sql`COALESCE(${comunicados.dataPostagem}, ${comunicados.criadoEm}) DESC`)
}

export async function criarComunicadoAction(dados: {
  titulo: string
  conteudo: string
  ativo: boolean
  papeis: string[]
  dataPostagem: string | null
}) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  if (!dados.titulo.trim()) throw new Error('Título obrigatório')
  if (!dados.conteudo.trim()) throw new Error('Conteúdo obrigatório')
  await db.insert(comunicados).values({
    grupoId: grupo.id,
    titulo: dados.titulo.trim(),
    conteudo: dados.conteudo.trim(),
    ativo: dados.ativo,
    papeis: dados.papeis,
    dataPostagem: dados.dataPostagem ? new Date(dados.dataPostagem) : null,
    criadoPorId: u.id,
  })
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function importarComunicadosAction(itens: {
  titulo: string
  conteudo: string
  ativo: boolean
  dataPostagem: string | null
}[]) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  if (!itens.length) throw new Error('Nenhum item para importar')
  await db.insert(comunicados).values(
    itens.map(i => ({
      grupoId: grupo.id,
      titulo: i.titulo.trim(),
      conteudo: i.conteudo.trim(),
      ativo: i.ativo,
      papeis: [] as string[],
      dataPostagem: i.dataPostagem ? new Date(i.dataPostagem) : null,
      criadoPorId: u.id,
    }))
  )
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  await db.update(comunicados).set({ ativo }).where(and(eq(comunicados.id, id), eq(comunicados.grupoId, grupo.id)))
  revalidatePath('/admin/comunicados')
  revalidatePath('/', 'layout')
}

export async function excluirComunicadoAction(id: string) {
  const u = await requireAdmin()
  const grupo = await getGrupoAtivo(u)
  await db.delete(comunicados).where(and(eq(comunicados.id, id), eq(comunicados.grupoId, grupo.id)))
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
  let grupo
  try {
    grupo = await getGrupoAtivo(u)
  } catch {
    return []
  }
  return db
    .select({ id: comunicados.id, titulo: comunicados.titulo, conteudo: comunicados.conteudo })
    .from(comunicados)
    .where(
      and(
        eq(comunicados.grupoId, grupo.id),
        eq(comunicados.ativo, true),
        sql`(${comunicados.dataPostagem} IS NULL OR ${comunicados.dataPostagem} <= now())`,
        sql`(array_length(${comunicados.papeis}, 1) IS NULL OR ${u.papel} = ANY(${comunicados.papeis}))`,
        sql`${comunicados.id} NOT IN (
          SELECT comunicado_id FROM comunicados_lidos WHERE usuario_id = ${u.id}
        )`
      )
    )
    .orderBy(sql`COALESCE(${comunicados.dataPostagem}, ${comunicados.criadoEm})`)
}
