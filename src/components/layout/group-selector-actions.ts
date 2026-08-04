'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function trocarGrupoAtivoAction(grupoId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMIN_PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  if (typeof grupoId !== 'string' || !grupoId) throw new Error('Grupo inválido')

  const cookieStore = await cookies()
  cookieStore.set('grupoAtivo', grupoId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  revalidatePath('/', 'layout')
}
