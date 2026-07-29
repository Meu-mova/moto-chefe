import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export const getUsuarioLogado = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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

// ─── Exceção pontual: entrada/importação de motos ─────────────────────────────
// Liberado nominalmente para o adm da loja de Pouso Alegre, por decisão
// explícita — NÃO é uma permissão do papel aux_adm, os demais aux_adm continuam
// de fora. Mesmo padrão de podeTransferirEntreGrupos em @/lib/grupo.
const EMAIL_ENTRADA_MOTOS = 'pedro.henrique@motochefesuldeminas.com.br'

export function podeRegistrarEntradaMotos(usuario: { papel: string; email: string }) {
  if (['admin_geral', 'admin_socio'].includes(usuario.papel)) return true
  return usuario.email === EMAIL_ENTRADA_MOTOS
}

export function canEditLoja(usuarioLojaId: string | null, targetLojaId: string, papel: string) {
  if (papel === 'admin_geral') return true
  return usuarioLojaId === targetLojaId
}
