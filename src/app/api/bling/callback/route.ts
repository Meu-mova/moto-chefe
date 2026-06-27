import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorTokens, salvarTokens } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // 1. Verificar sessão admin antes de qualquer troca de tokens
  try {
    const u = await getUsuarioLogado()
    if (u.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/bling?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // 2. Validar state (proteção CSRF)
  const storedState = req.cookies.get('bling_oauth_state')?.value
  if (!storedState || !state || state !== storedState) {
    return NextResponse.redirect(new URL('/admin/bling?erro=state_invalido', req.url))
  }

  if (error || !code) {
    const res = NextResponse.redirect(new URL('/admin/bling?erro=acesso_negado', req.url))
    res.cookies.set('bling_oauth_state', '', { maxAge: 0, path: '/' })
    return res
  }

  try {
    const tokens = await trocarCodePorTokens(code)
    await salvarTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)

    const res = NextResponse.redirect(new URL('/admin/bling?ok=1', req.url))
    res.cookies.set('bling_oauth_state', '', { maxAge: 0, path: '/' })
    return res
  } catch (e: any) {
    console.error('Bling OAuth callback error:', e)
    const res = NextResponse.redirect(new URL('/admin/bling?erro=token', req.url))
    res.cookies.set('bling_oauth_state', '', { maxAge: 0, path: '/' })
    return res
  }
}
