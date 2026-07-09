import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { blingAuthUrl } from '@/lib/bling'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
    if (usuario.papel !== 'admin_geral') {
      return NextResponse.redirect(new URL('/admin/bling?erro=sem_permissao', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const grupo = await getGrupoAtivo(usuario)

  const [cfg] = await db.select({ blingClientId: grupos.blingClientId }).from(grupos).where(eq(grupos.id, grupo.id)).limit(1)
  if (!cfg?.blingClientId) {
    return NextResponse.redirect(new URL('/admin/bling?erro=sem_credenciais', req.url))
  }

  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(blingAuthUrl(cfg.blingClientId, process.env.BLING_REDIRECT_URI!, state))
  res.cookies.set('bling_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutos
    path: '/',
  })
  res.cookies.set('bling_oauth_grupo', grupo.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
