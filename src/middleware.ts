// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// O middleware roda ANTES de toda página. A única coisa que ele faz é validar a
// sessão via supabase.auth.getUser() — uma chamada HTTP ao servidor de auth do
// Supabase, sem timeout. Se essa chamada trava (auth lento/rate-limit), o request
// inteiro pendura até os 300s da Vercel, antes mesmo da página renderizar — e
// nenhum timeout dentro da página adianta. Este helper limita a espera.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms no auth do middleware`)), ms)),
  ])
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Fail-open: se o auth do Supabase demorar, NÃO pendura o request. Segue em
  // frente — a própria página revalida a sessão (getUsuarioLogado) e redireciona
  // pro /login se não houver usuário. Assim um soluço do auth vira, no pior caso,
  // uma falha rápida na página, nunca um 504 de 5 minutos no site inteiro.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null
  try {
    const res = await withTimeout(supabase.auth.getUser(), 10000)
    user = res.data.user
  } catch {
    return supabaseResponse
  }

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (user?.user_metadata?.must_change_password === true) {
    if (!request.nextUrl.pathname.startsWith('/trocar-senha')) {
      return NextResponse.redirect(new URL('/trocar-senha', request.url))
    }
  }

  return supabaseResponse
}

// `assinar` fora do matcher: é a rota pública de assinatura de documento, onde
// quem entra é o cliente, sem conta no sistema. A credencial ali é o token do
// link, não a sessão do Supabase.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|assinar).*)'],
}
