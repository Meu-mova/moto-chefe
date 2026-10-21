'use server'
import { db } from '@/lib/db'
import { lojas, motos, usuarios } from '@/lib/db/schema'
import { eq, and, ne, count } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { geocodificarCep } from '@/lib/frete'
import { cifrarSenhaFabrica } from '@/lib/fabrica-senha'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

async function geocodificarSeInformado(cep: string | null) {
  if (!cep || !cep.trim()) return { geo: { cep: null, latitude: null, longitude: null }, geocodificado: true }
  const resultado = await geocodificarCep(cep)
  return {
    geo: {
      cep: cep.trim(),
      latitude: resultado ? String(resultado.coordenada.latitude) : null,
      longitude: resultado ? String(resultado.coordenada.longitude) : null,
    },
    geocodificado: resultado !== null,
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
  // Senha em branco mantém a atual: a tela nunca recebe a gravada (#292).
  const senhaNova = (formData.get('fabricaSenha') as string | null)?.trim()
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
    fabricaEmail: (formData.get('fabricaEmail') as string | null)?.trim() || null,
    ...(senhaNova ? { fabricaSenha: cifrarSenhaFabrica(senhaNova) } : {}),
    ...geo,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
  revalidatePath('/simulador')
  revalidatePath('/garantias')
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
