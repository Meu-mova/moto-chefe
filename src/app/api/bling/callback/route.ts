import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorTokens, salvarTokens } from '@/lib/bling'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

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

  // 2. Validar state (proteção CSRF) e recuperar o grupo que iniciou o fluxo
  const storedState = req.cookies.get('bling_oauth_state')?.value
  const grupoId = req.cookies.get('bling_oauth_grupo')?.value
  if (!storedState || !state || state !== storedState || !grupoId) {
    return NextResponse.redirect(new URL('/admin/bling?erro=state_invalido', req.url))
  }

  function limparCookies(res: NextResponse) {
    res.cookies.set('bling_oauth_state', '', { maxAge: 0, path: '/' })
    res.cookies.set('bling_oauth_grupo', '', { maxAge: 0, path: '/' })
    return res
  }

  if (error || !code) {
    return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=acesso_negado', req.url)))
  }

  try {
    const [grupo] = await db
      .select({ blingClientId: grupos.blingClientId, blingClientSecret: grupos.blingClientSecret })
      .from(grupos)
      .where(eq(grupos.id, grupoId))
      .limit(1)
    if (!grupo?.blingClientId || !grupo?.blingClientSecret) {
      return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=sem_credenciais', req.url)))
    }

    const tokens = await trocarCodePorTokens(grupo.blingClientId, grupo.blingClientSecret, process.env.BLING_REDIRECT_URI!, code)
    await salvarTokens(grupoId, tokens.access_token, tokens.refresh_token, tokens.expires_in)

    return limparCookies(NextResponse.redirect(new URL('/admin/bling?ok=1', req.url)))
  } catch (e: any) {
    console.error('Bling OAuth callback error:', e)
    return limparCookies(NextResponse.redirect(new URL('/admin/bling?erro=token', req.url)))
  }
}
