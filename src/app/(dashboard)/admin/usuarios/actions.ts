'use server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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
  conecta: string | null
}) {
  await assertAdmin()
  const supabase = getAdminClient()

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
    conecta: dados.conecta,
  })

  revalidatePath('/admin/usuarios')
}

export async function editarUsuarioAction(id: string, dados: {
  nome: string
  email: string
  novaSenha?: string
  papel: string
  lojaId: string | null
  conecta: string | null
}) {
  await assertAdmin()

  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel as any,
      lojaId: dados.lojaId,
      conecta: dados.conecta,
    }).where(eq(usuarios.id, id))

    if (dados.novaSenha?.trim()) {
      await tx.execute(sql`
        UPDATE auth.users
        SET email = ${dados.email},
            encrypted_password = crypt(${dados.novaSenha}, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${id}::uuid
      `)
    } else {
      await tx.execute(sql`
        UPDATE auth.users
        SET email = ${dados.email},
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${id}::uuid
      `)
    }
  })

  revalidatePath('/admin/usuarios')
}

export async function excluirUsuarioAction(id: string) {
  await assertAdmin()
  const supabase = getAdminClient()

  await db.delete(usuarios).where(eq(usuarios.id, id))

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/usuarios')
}
