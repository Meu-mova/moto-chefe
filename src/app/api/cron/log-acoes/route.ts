import { NextRequest, NextResponse } from 'next/server'
import { apagarLogAntigo } from '@/lib/log-acoes'
import { apagarTentativasAntigas } from '@/lib/limite-tentativas'

export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

// O log guarda 12 meses (#198); o resto sai uma vez por dia. Junto, as tentativas das
// ações públicas (#588), que só valem por uma hora.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apagadas = await apagarLogAntigo()
  const tentativas = await apagarTentativasAntigas()
  return NextResponse.json({ ok: true, apagadas, tentativas })
}
