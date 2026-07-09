'use server'
import { db } from '@/lib/db'
import { blingConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getBlingStatus } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function getBlingStatusAction() {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)
  return { ...(await getBlingStatus(grupo.id)), grupoNome: grupo.nome }
}

export async function desconectarBlingAction() {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)
  await db.update(blingConfig).set({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    atualizadoEm: new Date(),
  }).where(eq(blingConfig.grupoId, grupo.id))
  revalidatePath('/admin/bling')
}
