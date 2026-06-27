'use server'
import { db } from '@/lib/db'
import { blingConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getBlingStatus, blingAuthUrl } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function getBlingStatusAction() {
  await assertAdmin()
  return getBlingStatus()
}

export async function getBlingAuthUrlAction(): Promise<string> {
  await assertAdmin()
  return blingAuthUrl('mova-bling')
}

export async function desconectarBlingAction() {
  await assertAdmin()
  await db.update(blingConfig).set({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    atualizadoEm: new Date(),
  }).where(eq(blingConfig.id, 1))
  revalidatePath('/admin/bling')
}
