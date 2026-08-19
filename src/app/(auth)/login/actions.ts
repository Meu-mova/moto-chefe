// src/app/(auth)/login/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Separar "senha errada" de "não falei com o Supabase" não é preciosismo: no
  // incidente de 19/08 a chamada ficava pendurada e, quando enfim falhava, a
  // tela dizia "email ou senha inválidos" — o pessoal ficava tentando de novo
  // achando que tinha errado a senha.
  let error
  try {
    ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
  } catch {
    redirect('/login?error=indisponivel')
  }

  if (error) {
    const falhaDeRede = error.name === 'AuthRetryableFetchError' || !error.status
    redirect(falhaDeRede ? '/login?error=indisponivel' : '/login?error=1')
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
