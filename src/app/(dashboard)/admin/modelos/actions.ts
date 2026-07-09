'use server'
import { db } from '@/lib/db'
import { modelos, modeloBlingCodigos } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function criarModeloAction(formData: FormData) {
  await assertAdmin()
  await db.insert(modelos).values({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
    motor: formData.get('motor') as string,
    velocidadeMax: formData.get('velocidade_max') as string,
  })
  revalidatePath('/admin/modelos')
}

export async function editarModeloAction(id: string, formData: FormData) {
  await assertAdmin()
  await db.update(modelos).set({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
    motor: formData.get('motor') as string,
    velocidadeMax: formData.get('velocidade_max') as string,
  }).where(eq(modelos.id, id))
  revalidatePath('/admin/modelos')
}

export async function atualizarBlingCodigoAction(modeloId: string, codigo: string) {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)

  if (!codigo.trim()) {
    await db.delete(modeloBlingCodigos)
      .where(and(eq(modeloBlingCodigos.modeloId, modeloId), eq(modeloBlingCodigos.grupoId, grupo.id)))
  } else {
    await db.insert(modeloBlingCodigos)
      .values({ modeloId, grupoId: grupo.id, codigo: codigo.trim() })
      .onConflictDoUpdate({
        target: [modeloBlingCodigos.modeloId, modeloBlingCodigos.grupoId],
        set: { codigo: codigo.trim() },
      })
  }
  revalidatePath('/admin/modelos')
}
