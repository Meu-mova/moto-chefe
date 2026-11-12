import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/cron-autorizado'
import { gerarCobrancas, avisarVencimentos } from '@/lib/mensalidade/gerar'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const resultados = await gerarCobrancas()
  const avisosVencimento = await avisarVencimentos()
  return NextResponse.json({ ok: true, resultados, avisosVencimento })
}
