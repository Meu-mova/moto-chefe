'use server'
import { db } from '@/lib/db'
import { kommoConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getKommoStatus, salvarCredenciaisKommo, kommoRedirectUri } from '@/lib/kommo'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function getKommoStatusAction() {
  await assertAdmin()
  return { ...(await getKommoStatus()), redirectUri: kommoRedirectUri() }
}

export async function salvarCredenciaisKommoAction(clientId: string, clientSecret: string, subdominio: string) {
  await assertAdmin()
  if (!clientId.trim() || !clientSecret.trim()) throw new Error('Client ID e Client Secret são obrigatórios')
  const sub = subdominio.trim().replace(/^https?:\/\//, '').replace(/\.kommo\.com.*$/i, '').trim()
  await salvarCredenciaisKommo(clientId.trim(), clientSecret.trim(), sub || null)
  revalidatePath('/admin/kommo')
}

export async function desconectarKommoAction() {
  await assertAdmin()
  await db.update(kommoConfig)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, atualizadoEm: new Date() })
    .where(eq(kommoConfig.id, 'global'))
  revalidatePath('/admin/kommo')
}
