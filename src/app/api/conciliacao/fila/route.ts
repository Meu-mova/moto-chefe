import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { importacoesCartao, grupos } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

function autorizado(req: NextRequest): boolean {
  return req.headers.get('x-cron-secret') === process.env.CRON_SECRET
}

// O agente do PC da loja pergunta se tem pedido para este grupo. A busca e a
// marcação acontecem numa instrução só, com SKIP LOCKED: se dois agentes
// estiverem no ar por engano, cada um leva um pedido diferente — nunca o mesmo.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grupoCnpj = req.nextUrl.searchParams.get('grupoCnpj')
  if (!grupoCnpj) return NextResponse.json({ error: 'grupoCnpj obrigatório' }, { status: 400 })

  const [grupo] = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.cnpj, grupoCnpj)).limit(1)
  if (!grupo) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 })

  const linhas = await db.execute(sql`
    UPDATE importacoes_cartao
       SET status = 'rodando', iniciado_em = now()
     WHERE id = (
       SELECT id FROM importacoes_cartao
        WHERE grupo_id = ${grupo.id} AND status = 'pendente'
        ORDER BY criado_em
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id
  `)

  const id = (linhas as unknown as { id: string }[])[0]?.id ?? null
  return NextResponse.json({ pedido: id ? { id, grupoCnpj } : null })
}

// O agente devolve o resultado. Falha parcial (uma operadora deu errado) chega
// aqui como `erro` preenchido junto com o `resultado` das que funcionaram —
// nunca como sucesso limpo.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, resultado, erro } = await req.json() as {
    id?: string
    resultado?: Record<string, unknown>
    erro?: string
  }
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  await db.update(importacoesCartao)
    .set({
      status: erro ? 'erro' : 'concluida',
      resultado: resultado ?? null,
      erro: erro ?? null,
      concluidoEm: new Date(),
    })
    .where(eq(importacoesCartao.id, id))

  return NextResponse.json({ ok: true })
}
