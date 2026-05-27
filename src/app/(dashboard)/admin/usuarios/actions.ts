'use server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function criarUsuarioAction(formData: FormData) {
  await assertAdmin()
  const supabase = await createClient()

  const email = formData.get('email') as string
  const nome = formData.get('nome') as string
  const papel = formData.get('papel') as string
  const lojaId = (formData.get('loja_id') as string) || null
  const senha = formData.get('senha') as string

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)

  await db.insert(usuarios).values({
    id: data.user.id,
    nome,
    email,
    papel: papel as any,
    lojaId,
  })

  revalidatePath('/admin/usuarios')
}

export async function editarPapelAction(id: string, papel: string, lojaId: string | null) {
  await assertAdmin()
  await db.update(usuarios).set({ papel: papel as any, lojaId }).where(eq(usuarios.id, id))
  revalidatePath('/admin/usuarios')
}
