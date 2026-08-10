import { NextRequest, NextResponse } from 'next/server'
import { alertarPedidosFabrica } from '@/lib/whatsapp/pedidos-fabrica'

// Login + scraping do portal da fábrica, agora uma conta por loja, leva bem mais
// que o default do Next.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // O cron da Vercel manda "Authorization: Bearer <CRON_SECRET>"; o header
  // x-cron-secret é o padrão já usado pela rota de conciliação (chamada manual).
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultados = await alertarPedidosFabrica()
  return NextResponse.json({ ok: true, resultados })
}

// Mesma rotina por POST, pra permitir disparo manual sem esperar o cron.
export const POST = GET
