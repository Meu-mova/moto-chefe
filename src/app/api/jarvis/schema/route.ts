import { NextRequest, NextResponse } from 'next/server'
import { client } from '@/lib/db'
import { tokenValido } from '@/lib/jarvis-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    const linhas = await client<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `
    const schema: Record<string, { coluna: string; tipo: string }[]> = {}
    for (const l of linhas) {
      ;(schema[l.table_name] ??= []).push({ coluna: l.column_name, tipo: l.data_type })
    }
    return NextResponse.json({ schema })
  } catch (e) {
    console.error('jarvis/schema erro:', e)
    return NextResponse.json({ erro: 'erro ao ler o schema' }, { status: 500 })
  }
}
