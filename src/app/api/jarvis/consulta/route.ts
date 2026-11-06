import { NextRequest, NextResponse } from 'next/server'
import { tokenValido } from '@/lib/jarvis-auth'
import { consultaSomenteLeitura } from '@/lib/jarvis/consulta-readonly'
import { respostaDoErro } from '@/lib/jarvis/erros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const resposta = respostaDoErro(e)
    if (resposta) return NextResponse.json(resposta.corpo, { status: resposta.status })
    return NextResponse.json({ erro: 'erro na consulta' }, { status: 400 })
  }
}
