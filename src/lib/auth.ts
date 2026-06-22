import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const getUsuarioLogado = cache(async () => {
  const supabase = await createClient()
  // middleware já verificou o token via getUser() — aqui lemos do cookie sem HTTP
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (!user) redirect('/login')

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, user.id))
    .limit(1)

  if (!usuario) redirect('/login')

  return usuario
})

export function isAdmin(papel: string) {
  return papel === 'admin_geral'
}

export function canEditLoja(usuarioLojaId: string | null, targetLojaId: string, papel: string) {
  if (papel === 'admin_geral') return true
  return usuarioLojaId === targetLojaId
}
