'use server'
import { db } from '@/lib/db'
import { kommoConfig } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getKommoStatus, salvarCredenciaisKommo, salvarTokenLongo, kommoRedirectUri } from '@/lib/kommo'
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

// Conecta por token de longa duração (integração privada do Kommo).
export async function salvarTokenKommoAction(token: string, subdominio: string) {
  await assertAdmin()
  const t = token.trim()
  const sub = subdominio.trim().replace(/^https?:\/\//, '').replace(/\.kommo\.com.*$/i, '').trim()
  if (!t) throw new Error('Cole o token de longa duração')
  if (!sub) throw new Error('Informe o subdomínio da conta (ex.: motochefebrasil)')

  // Extrai a validade (exp) do JWT, se possível
  let expiraEm: Date | null = null
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString('utf8'))
    if (payload?.exp) expiraEm = new Date(payload.exp * 1000)
  } catch { /* token não-JWT: fica sem validade conhecida */ }

  await salvarTokenLongo(t, sub, expiraEm)
  revalidatePath('/admin/kommo')
}

export async function desconectarKommoAction() {
  await assertAdmin()
  await db.update(kommoConfig)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, atualizadoEm: new Date() })
    .where(eq(kommoConfig.id, 'global'))
  revalidatePath('/admin/kommo')
}
