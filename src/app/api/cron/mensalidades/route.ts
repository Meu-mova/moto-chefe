import { NextRequest, NextResponse } from 'next/server'
import { gerarCobrancas, avisarVencimentos } from '@/lib/mensalidade/gerar'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const resultados = await gerarCobrancas()
  const avisosVencimento = await avisarVencimentos()
  return NextResponse.json({ ok: true, resultados, avisosVencimento })
}
