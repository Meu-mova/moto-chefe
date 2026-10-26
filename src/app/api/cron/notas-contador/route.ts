import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { BUCKET_CONTADOR, apagarZipsVencidos, type ArmazemZips } from '@/lib/notas-contador-limpeza'

export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

// Zips do envio ao contador com mais de 7 dias (#402) saem uma vez por dia, de todos os grupos.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const bucket = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from(BUCKET_CONTADOR)
  const armazem: ArmazemZips = {
    async listar(pasta, offset, limit) {
      const { data, error } = await bucket.list(pasta, { offset, limit })
      return error ? null : data
    },
    async remover(caminhos) {
      const { error } = await bucket.remove(caminhos)
      if (error) throw new Error(`falha ao apagar zips vencidos: ${error.message}`)
    },
  }
  const apagados = await apagarZipsVencidos(armazem)
  return NextResponse.json({ ok: true, apagados })
}
