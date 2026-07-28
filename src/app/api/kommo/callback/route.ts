import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { getKommoConfig, trocarCodePorTokens, salvarTokensKommo } from '@/lib/kommo'

export async function GET(req: NextRequest) {
  // 1. Sessão admin antes de qualquer troca de tokens
  try {
    const u = await getUsuarioLogado()
    if (u.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/kommo?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const referer = searchParams.get('referer') // ex.: "minhaconta.kommo.com"
  const error = searchParams.get('error')

  function limpar(res: NextResponse) {
    res.cookies.set('kommo_oauth_state', '', { maxAge: 0, path: '/' })
    return res
  }

  // 2. Valida o state (CSRF)
  const storedState = req.cookies.get('kommo_oauth_state')?.value
  if (!storedState || !state || state !== storedState) {
    return limpar(NextResponse.redirect(new URL('/admin/kommo?erro=state_invalido', req.url)))
  }
  if (error || !code) {
    return limpar(NextResponse.redirect(new URL('/admin/kommo?erro=acesso_negado', req.url)))
  }

  // 3. Subdomínio da conta vem no `referer` (fallback pro salvo, se ausente)
  const cfg = await getKommoConfig()
  const subdominio = (referer?.replace(/\.kommo\.com.*$/i, '').trim() || cfg?.subdominio || '').trim()
  if (!cfg?.clientId || !cfg?.clientSecret) {
    return limpar(NextResponse.redirect(new URL('/admin/kommo?erro=sem_credenciais', req.url)))
  }
  if (!subdominio) {
    return limpar(NextResponse.redirect(new URL('/admin/kommo?erro=sem_subdominio', req.url)))
  }

  try {
    const tokens = await trocarCodePorTokens(subdominio, cfg.clientId, cfg.clientSecret, code)
    await salvarTokensKommo(tokens.access_token, tokens.refresh_token, tokens.expires_in, subdominio)
    return limpar(NextResponse.redirect(new URL('/admin/kommo?ok=1', req.url)))
  } catch (e) {
    console.error('Kommo OAuth callback error:', e)
    return limpar(NextResponse.redirect(new URL('/admin/kommo?erro=token', req.url)))
  }
}
