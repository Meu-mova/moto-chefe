import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { getKommoConfig, kommoAuthUrl } from '@/lib/kommo'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
    if (usuario.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/kommo?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const cfg = await getKommoConfig()
  if (!cfg?.clientId) {
    return NextResponse.redirect(new URL('/admin/kommo?erro=sem_credenciais', req.url))
  }

  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(kommoAuthUrl(cfg.clientId, state))
  res.cookies.set('kommo_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutos
    path: '/',
  })
  return res
}
