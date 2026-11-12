import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/cron-autorizado'
import { rodarTodosOsGrupos } from '@/lib/mercadopago/rodada'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Uma rodada por dia: importa a maquininha Mercado Pago de cada grupo com credencial.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const grupos = await rodarTodosOsGrupos()
  return NextResponse.json({ ok: true, grupos })
}
