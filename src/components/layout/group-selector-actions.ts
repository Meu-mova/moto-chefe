'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function trocarGrupoAtivoAction(grupoId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMIN_PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  if (typeof grupoId !== 'string' || !grupoId) throw new Error('Grupo inválido')

  // Porta principal do seletor de empresa: valida posse ANTES de gravar o
  // cookie. Sem isto, qualquer admin_socio trocava para o CNPJ de outro
  // lojista só chamando esta action com outro id — era a causa raiz do
  // vazamento entre tenants. Grupo sem posse: não grava, devolve erro.
  const podeVer = await podeUsuarioVerGrupo(usuario, grupoId)
  if (!podeVer) throw new Error('Você não tem acesso a este grupo')

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
