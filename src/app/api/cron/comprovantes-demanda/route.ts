import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { BUCKET_COMPROVANTES } from '@/lib/comprovante-arquivo'
import { DIAS_COMPROVANTE_SINAL, PASTA_COMPROVANTE_SINAL } from '@/lib/demanda-comprovante'
import { apagarArquivosVencidos, type Armazem } from '@/lib/storage-limpeza'

export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}

// Comprovante do sinal da demanda com mais de 90 dias sai uma vez por dia, de todos os grupos.
// Só a pasta demandas/: o resto do bucket (saídas de caixa) não é deste cron.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const bucket = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from(BUCKET_COMPROVANTES)
  const armazem: Armazem = {
    async listar(pasta, offset, limit) {
      const { data, error } = await bucket.list(pasta, { offset, limit })
      if (error) {
        console.error(`[cron comprovantes-demanda] falha ao listar "${pasta}":`, error.message)
        throw error
      }
      return data
    },
    async remover(caminhos) {
      const { error } = await bucket.remove(caminhos)
      if (error) throw new Error(`falha ao apagar comprovantes vencidos: ${error.message}`)
    },
  }
  const { apagados, falhas } = await apagarArquivosVencidos(armazem, { raiz: PASTA_COMPROVANTE_SINAL, dias: DIAS_COMPROVANTE_SINAL })
  // 500 com falha: limpeza parcial não pode passar por sucesso no painel de crons.
  if (falhas > 0) return NextResponse.json({ ok: false, apagados, falhas }, { status: 500 })
  return NextResponse.json({ ok: true, apagados })
}
