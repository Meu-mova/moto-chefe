import { NextRequest, NextResponse } from 'next/server'
import { sincronizarTodosOsGrupos } from '@/lib/avaliacoes-google/avaliacoes'
import { buscarLugarNoGoogle } from '@/lib/avaliacoes-google/places'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

// Uma leitura por loja por dia no Google, e a limpeza do que passou de 30 dias.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const grupos = await sincronizarTodosOsGrupos({ buscarLugar: buscarLugarNoGoogle })
  return NextResponse.json({ ok: true, grupos })
}
