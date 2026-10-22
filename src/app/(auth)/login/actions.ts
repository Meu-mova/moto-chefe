// src/app/(auth)/login/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { origemDaRequisicao, registrarSemFalhar } from '@/lib/log-acoes'
import { getGrupoAtivo } from '@/lib/grupo'

export async function loginAction(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Separar "senha errada" de "não falei com o Supabase" não é preciosismo: no
  // incidente de 19/08 a chamada ficava pendurada e, quando enfim falhava, a
  // tela dizia "email ou senha inválidos" — o pessoal ficava tentando de novo
  // achando que tinha errado a senha.
  let error
  let deveTrocarSenha = false
  try {
    const res = await supabase.auth.signInWithPassword({ email, password })
    error = res.error
    deveTrocarSenha = res.data.user?.user_metadata?.must_change_password === true
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
  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1)
  if (usuario && !usuario.ativo) {
    await supabase.auth.signOut()
    redirect('/login?error=inativo')
  }

  // Grupo em que a pessoa cai (cookie ou padrão); a Conta é a do grupo, como nas outras linhas.
  if (usuario) {
    const grupo = await getGrupoAtivo(usuario).catch(() => null)
    await registrarSemFalhar({
      tipo: 'login', usuarioId: usuario.id, contaId: grupo?.contaId ?? usuario.contaId, grupoId: grupo?.id ?? null,
      ...origemDaRequisicao(await headers()),
    })
  }

  // Senha provisória: vai direto para a troca. O middleware também leva, mas só na navegação
  // seguinte; sem isto a pessoa via o dashboard uma vez antes.
  redirect(deveTrocarSenha ? '/trocar-senha' : '/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
