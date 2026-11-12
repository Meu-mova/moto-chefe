import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/cron-autorizado'
import { apagarLogAntigo } from '@/lib/log-acoes'

export const dynamic = 'force-dynamic'

// O log guarda 12 meses (#198); o resto sai uma vez por dia.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apagadas = await apagarLogAntigo()
  return NextResponse.json({ ok: true, apagadas })
}
