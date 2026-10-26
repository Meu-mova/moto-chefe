import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { BUCKET_CONTADOR, apagarZipsVencidos, bucketInexistente, type ArmazemZips } from '@/lib/notas-contador-limpeza'

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
  const storage = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
  const { error: erroBucket } = await storage.getBucket(BUCKET_CONTADOR)
  if (erroBucket) {
    // O bucket só nasce no primeiro envio por link: até lá não há o que limpar. Outro erro não pode passar por sucesso.
    if (bucketInexistente(erroBucket)) return NextResponse.json({ ok: true, apagados: 0 })
    console.error('[cron notas-contador] falha ao consultar o bucket:', erroBucket.message)
    return NextResponse.json({ ok: false, apagados: 0, falhas: 1 }, { status: 500 })
  }
  const bucket = storage.from(BUCKET_CONTADOR)
  const armazem: ArmazemZips = {
    async listar(pasta, offset, limit) {
      const { data, error } = await bucket.list(pasta, { offset, limit })
      if (error) {
        console.error(`[cron notas-contador] falha ao listar "${pasta}":`, error.message)
        throw error
      }
      return data
    },
    async remover(caminhos) {
      const { error } = await bucket.remove(caminhos)
      if (error) throw new Error(`falha ao apagar zips vencidos: ${error.message}`)
    },
  }
  const { apagados, falhas } = await apagarZipsVencidos(armazem)
  // 500 com falha: limpeza parcial não pode passar por sucesso no painel de crons.
  if (falhas > 0) return NextResponse.json({ ok: false, apagados, falhas }, { status: 500 })
  return NextResponse.json({ ok: true, apagados })
}
