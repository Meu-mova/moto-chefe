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

export async function criarUsuarioAction(dados: {
  nome: string
  email: string
  senha: string
  papel: string
  lojaId: string | null
}) {
  await assertAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email: dados.email,
    password: dados.senha,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)

  await db.insert(usuarios).values({
    id: data.user.id,
    nome: dados.nome,
    email: dados.email,
    papel: dados.papel as any,
    lojaId: dados.lojaId,
  })

  revalidatePath('/admin/usuarios')
}

export async function editarUsuarioAction(id: string, dados: {
  nome: string
  email: string
  novaSenha?: string
  papel: string
  lojaId: string | null
}) {
  await assertAdmin()
  const supabase = await createClient()

  await db.update(usuarios).set({
    nome: dados.nome,
    email: dados.email,
    papel: dados.papel as any,
    lojaId: dados.lojaId,
  }).where(eq(usuarios.id, id))

  if (dados.novaSenha?.trim()) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email: dados.email,
      password: dados.novaSenha,
    })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email: dados.email,
    })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/usuarios')
}

export async function excluirUsuarioAction(id: string) {
  await assertAdmin()
  const supabase = await createClient()

  await db.delete(usuarios).where(eq(usuarios.id, id))

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/usuarios')
}
