import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sincronizarGrupo } from '@/lib/sefaz/sincronizar'

// SOAP + TLS mútuo + lote grande passa folgado do default.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
    || req.headers.get('x-cron-secret') === secret
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ativos = await db.select({ id: grupos.id, nome: grupos.nome })
    .from(grupos).where(eq(grupos.ativo, true))

  const resultados = []
  for (const grupo of ativos) {
    // Um grupo por vez, em série: são conexões TLS com certificados
    // diferentes, e a SEFAZ conta consumo por CNPJ. Paralelizar não ganha nada
    // e atrapalha o diagnóstico quando um deles falha.
    try {
      resultados.push({ grupo: grupo.nome, ...(await sincronizarGrupo(grupo)) })
    } catch (e) {
      // sincronizarGrupo já trata falha de rede internamente (vira status
      // 'erro' sem lançar); isto aqui cobre o que escapa desse try interno —
      // por exemplo um erro no SELECT inicial em nfeDfeSync. Sem este
      // try/catch, um grupo com problema aborta o `for` inteiro: os grupos
      // seguintes nem são tentados e o JSON já calculado se perde num 500. O
      // isolamento entre CNPJs é premissa do projeto — um grupo quebrado não
      // pode impedir os outros de sincronizar.
      const erro = e instanceof Error ? e.message : 'Falha inesperada ao sincronizar o grupo'
      resultados.push({ grupo: grupo.nome, status: 'erro' as const, documentos: 0, erro })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
