import { NextRequest, NextResponse } from 'next/server'
import { db, execRows } from '@/lib/db'
import { importacoesCartao, grupos } from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { chaveDoCnpj } from '@/lib/grupo-cnpj'

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

  // Comparação por dígitos: máscara diferente no cadastro não pode desligar o
  // grupo inteiro — ver src/lib/grupo-cnpj.ts.
  const [grupo] = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(sql`upper(regexp_replace(${grupos.cnpj}, '[^0-9a-zA-Z]', '', 'g')) = ${chaveDoCnpj(grupoCnpj)}`)
    .limit(1)
  if (!grupo) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 })

  const linhas = await execRows(sql`
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

  let corpo: { id?: string; resultado?: Record<string, unknown>; erro?: string }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const { id, resultado, erro } = corpo
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Só pedido em aberto aceita resultado: sem isso um POST repetido (ou
  // atrasado) sobrescreve um pedido já concluído. E responder ok:true sem ter
  // gravado nada faz o agente achar que entregou — foi assim que pedido
  // travado passou despercebido.
  const atualizados = await db.update(importacoesCartao)
    .set({
      status: erro ? 'erro' : 'concluida',
      resultado: resultado ?? null,
      erro: erro ?? null,
      concluidoEm: new Date(),
    })
    .where(and(
      eq(importacoesCartao.id, id),
      inArray(importacoesCartao.status, ['pendente', 'rodando']),
    ))
    .returning({ id: importacoesCartao.id })

  if (atualizados.length === 0) {
    return NextResponse.json({ error: 'Pedido não encontrado ou já finalizado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
