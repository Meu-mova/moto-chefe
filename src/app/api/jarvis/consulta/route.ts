import { NextRequest, NextResponse } from 'next/server'
import { tokenValido } from '@/lib/jarvis-auth'
import { consultaSomenteLeitura, ConsultaError } from '@/lib/jarvis/consulta-readonly'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: Record<string, number> = { vazio: 400, nao_select: 400, multiplos: 400, timeout: 408, erro: 400 }
const MSG: Record<string, string> = {
  vazio: 'sql vazio',
  nao_select: 'apenas SELECT e permitido',
  multiplos: 'apenas um comando (sem ;)',
  timeout: 'consulta demorou demais',
  erro: 'erro na consulta',
}

export async function POST(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  let sql = ''
  try {
    sql = String((await req.json())?.sql ?? '')
  } catch {
    return NextResponse.json({ erro: 'json invalido' }, { status: 400 })
  }
  try {
    return NextResponse.json(await consultaSomenteLeitura(sql))
  } catch (e) {
    if (e instanceof ConsultaError) {
      return NextResponse.json(
        { erro: MSG[e.tipo], detalhe: e.detalhe || undefined },
        { status: STATUS[e.tipo] },
      )
    }
    return NextResponse.json({ erro: 'erro na consulta' }, { status: 400 })
  }
}
