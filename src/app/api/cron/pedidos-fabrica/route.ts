import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/cron-autorizado'
import { alertarPedidosFabrica } from '@/lib/whatsapp/pedidos-fabrica'

// Login + scraping do portal da fábrica, agora uma conta por loja, leva bem mais
// que o default do Next.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultados = await alertarPedidosFabrica()
  return NextResponse.json({ ok: true, resultados })
}

// Mesma rotina por POST, pra permitir disparo manual sem esperar o cron.
export const POST = GET
