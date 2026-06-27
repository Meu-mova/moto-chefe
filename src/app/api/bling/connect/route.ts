import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { blingAuthUrl } from '@/lib/bling'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const u = await getUsuarioLogado()
    if (u.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/bling?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(blingAuthUrl(state))
  res.cookies.set('bling_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutos
    path: '/',
  })
  return res
}
