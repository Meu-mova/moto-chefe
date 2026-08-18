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
    // Motor e velocidade máx. não são do modelo (motor vem por moto no XML;
    // velocidade não é usada). Colunas NOT NULL, então gravam vazio.
    motor: '',
    velocidadeMax: '',
  })
  revalidatePath('/admin/modelos')
}

export async function editarModeloAction(id: string, formData: FormData) {
  await assertAdmin()
  // `motor` e `velocidadeMax` ficam de fora do set de propósito — preservam o
  // valor dos modelos antigos que ainda os têm preenchidos.
  await db.update(modelos).set({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
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
