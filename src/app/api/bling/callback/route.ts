import { NextRequest, NextResponse } from 'next/server'
import { trocarCodePorTokens, salvarTokens } from '@/lib/bling'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/admin/bling?erro=acesso_negado', req.url))
  }

  try {
    const tokens = await trocarCodePorTokens(code)
    await salvarTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return NextResponse.redirect(new URL('/admin/bling?ok=1', req.url))
  } catch (e: any) {
    console.error('Bling OAuth callback error:', e)
    return NextResponse.redirect(new URL('/admin/bling?erro=token', req.url))
  }
}
