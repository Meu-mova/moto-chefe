import { NextRequest, NextResponse } from 'next/server'
import { client } from '@/lib/db'
import { tokenValido } from '@/lib/jarvis-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAP = 200

export async function POST(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }

  let sqlText = ''
  try {
    const body = await req.json()
    sqlText = String(body?.sql ?? '').trim()
  } catch {
    return NextResponse.json({ erro: 'json invalido' }, { status: 400 })
  }

  if (!sqlText) return NextResponse.json({ erro: 'sql vazio' }, { status: 400 })
  if (!/^select\b/i.test(sqlText)) {
    return NextResponse.json({ erro: 'apenas SELECT e permitido' }, { status: 400 })
  }
  if (sqlText.includes(';')) {
    return NextResponse.json({ erro: 'apenas um comando (sem ;)' }, { status: 400 })
  }
  // Nada de blocklist de palavras (daria falso-positivo em texto pt-BR tipo
  // 'Joao do Vale'). A garantia de que NADA escreve e' a transacao read-only
  // abaixo — o Postgres recusa qualquer escrita de forma autoritativa, e
  // comandos de escrita nem comecam com 'select' (barrados acima).

  const inicio = Date.now()
  try {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe('SET LOCAL transaction_read_only = on')
      await tx.unsafe('SET LOCAL statement_timeout = 5000')
      return await tx.unsafe(`SELECT * FROM ( ${sqlText} ) AS _jarvis_sub LIMIT ${CAP + 1}`)
    })
    const arr = Array.from(rows as Iterable<unknown>)
    const truncated = arr.length > CAP
    console.log(
      `jarvis/consulta ok: ${arr.length} linhas em ${Date.now() - inicio}ms | ${sqlText.slice(0, 120)}`,
    )
    return NextResponse.json({
      rows: arr.slice(0, CAP),
      rowCount: Math.min(arr.length, CAP),
      truncated,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro'
    const timeout = /statement timeout|canceling statement/i.test(msg)
    console.error('jarvis/consulta erro:', msg)
    return NextResponse.json(
      { erro: timeout ? 'consulta demorou demais' : 'erro na consulta', detalhe: msg.slice(0, 200) },
      { status: timeout ? 408 : 400 },
    )
  }
}
