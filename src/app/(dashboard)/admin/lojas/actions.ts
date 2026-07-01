'use server'
import { db } from '@/lib/db'
import { lojas, motos, usuarios } from '@/lib/db/schema'
import { eq, and, ne, count } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function criarLojaAction(formData: FormData) {
  await assertAdmin()
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    grupoId: '00000000-0000-4000-8000-000000000001', // Sul de Minas
  })
  revalidatePath('/admin/lojas')
}

export async function editarLojaAction(id: string, formData: FormData) {
  await assertAdmin()
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
}

export async function desativarLojaAction(id: string) {
  await assertAdmin()

  const [{ total: motosAtivas }] = await db
    .select({ total: count() })
    .from(motos)
    .where(and(eq(motos.lojaId, id), ne(motos.status, 'vendida')))

  if (motosAtivas > 0) {
    throw new Error(`Loja possui ${motosAtivas} moto(s) ativa(s). Transfira-as antes de desativar.`)
  }

  const [{ total: usuariosAtivos }] = await db
    .select({ total: count() })
    .from(usuarios)
    .where(eq(usuarios.lojaId, id))

  if (usuariosAtivos > 0) {
    throw new Error(`Loja possui ${usuariosAtivos} usuário(s) associado(s). Reatribua-os antes de desativar.`)
  }

  await db.update(lojas).set({ ativa: false }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
}
