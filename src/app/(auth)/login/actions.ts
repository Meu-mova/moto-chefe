// src/app/(auth)/login/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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

  // Conta desativada não pode logar, mesmo com a senha certa. getUsuarioLogado
  // já pega isso mais adiante (redireciona pra /conta-desativada), mas checar
  // aqui também dá uma mensagem clara na hora, sem abrir sessão à toa: desfaz
  // o signIn e devolve pro /login com o motivo, em vez de mandar pro
  // /dashboard pra só então ser expulso.
  const [usuario] = await db.select({ ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.email, email)).limit(1)
  if (usuario && !usuario.ativo) {
    await supabase.auth.signOut()
    redirect('/login?error=inativo')
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
