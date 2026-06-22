'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function trocarSenhaAction(formData: FormData) {
  const novaSenha = formData.get('nova_senha') as string
  const confirmar = formData.get('confirmar_senha') as string

  if (novaSenha !== confirmar) {
    redirect('/trocar-senha?error=mismatch')
  }

  if (novaSenha.length < 8) {
    redirect('/trocar-senha?error=short')
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: novaSenha,
    data: { must_change_password: false },
  })

  if (error) {
    redirect('/trocar-senha?error=1')
  }

  redirect('/dashboard')
}
