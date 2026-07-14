'use server'
import { db } from '@/lib/db'
import { lojas, motos, usuarios } from '@/lib/db/schema'
import { eq, and, ne, count } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { geocodificarCep } from '@/lib/frete'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

async function geocodificarSeInformado(cep: string | null) {
  if (!cep || !cep.trim()) return { geo: { cep: null, latitude: null, longitude: null }, geocodificado: true }
  const coord = await geocodificarCep(cep)
  return {
    geo: {
      cep: cep.trim(),
      latitude: coord ? String(coord.latitude) : null,
      longitude: coord ? String(coord.longitude) : null,
    },
    geocodificado: coord !== null,
  }
}

export async function criarLojaAction(formData: FormData): Promise<{ geocodificado: boolean }> {
  await assertAdmin()
  const grupoId = formData.get('grupoId') as string
  if (!grupoId) throw new Error('Selecione o grupo')
  const { geo, geocodificado } = await geocodificarSeInformado(formData.get('cep') as string | null)
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    grupoId,
    ...geo,
  })
  revalidatePath('/admin/lojas')
  return { geocodificado }
}

export async function editarLojaAction(id: string, formData: FormData): Promise<{ geocodificado: boolean }> {
  await assertAdmin()
  const { geo, geocodificado } = await geocodificarSeInformado(formData.get('cep') as string | null)
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    ...geo,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
  revalidatePath('/simulador')
  return { geocodificado }
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
