import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas } from '@/lib/db/schema'
import { eq, and, between, sql } from 'drizzle-orm'

export type TransacaoCartao = {
  nsu?: string
  autorizacao?: string
  dataTransacao: string   // YYYY-MM-DD
  valorBruto: number
  valorLiquido?: number
  parcelas: number
  tipo: 'credito' | 'debito'
  status: string
  rawData?: Record<string, unknown>
}

export type PayloadConciliacao = {
  operadora: 'infinitypay' | 'stone' | 'pagueveloz'
  transacoes: TransacaoCartao[]
}

const TOLERANCE = 0.05 // R$ 0,05 de tolerância no valor

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: PayloadConciliacao = await req.json()
  const { operadora, transacoes } = body

  if (!operadora || !Array.isArray(transacoes) || transacoes.length === 0) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  let importadas = 0
  let duplicadas = 0
  let conciliadas = 0

  for (const t of transacoes) {
    // Ignora transações não aprovadas
    if (!['aprovado', 'approved', 'captured', 'capturada'].includes(t.status.toLowerCase())) continue

    // Evita duplicata pela chave (operadora, nsu)
    if (t.nsu) {
      const [existente] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(eq(conciliacoesCartao.operadora, operadora), eq(conciliacoesCartao.nsu, t.nsu)))
        .limit(1)
      if (existente) { duplicadas++; continue }
    }

    // Tenta casar com uma venda: mesmo dia ± 1 dia, valor bruto próximo, mesma qtd de parcelas
    const dataBase = new Date(t.dataTransacao + 'T12:00:00Z')
    const dataMin = new Date(dataBase); dataMin.setDate(dataMin.getDate() - 1)
    const dataMax = new Date(dataBase); dataMax.setDate(dataMax.getDate() + 1)

    const vendasCandidatas = await db
      .select({ id: vendas.id, valor: vendas.valor, pagamentos: vendas.pagamentos })
      .from(vendas)
      .where(between(vendas.dataVenda, dataMin, dataMax))

    let vendaId: string | null = null
    for (const v of vendasCandidatas) {
      const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
      const pgtoCartao = pgtos.find(p =>
        ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
        Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
        (!p.parcelas || p.parcelas === t.parcelas)
      )
      if (pgtoCartao) { vendaId = v.id; break }
    }

    // Endpoint sem sessão de usuário (autenticado por secret) — não é possível
    // derivar o grupo ativo. Fixo em Sul de Minas até este endpoint ser
    // religado a uma automação específica de grupo.
    await db.insert(conciliacoesCartao).values({
      grupoId: '00000000-0000-4000-8000-000000000001',
      operadora,
      dataTransacao: t.dataTransacao,
      nsu: t.nsu ?? null,
      autorizacao: t.autorizacao ?? null,
      valorBruto: String(t.valorBruto),
      valorLiquido: t.valorLiquido != null ? String(t.valorLiquido) : null,
      parcelas: t.parcelas,
      tipo: t.tipo,
      status: t.status,
      vendaId: vendaId ?? undefined,
      conciliado: vendaId !== null,
      conciliadoEm: vendaId !== null ? new Date() : null,
      rawData: t.rawData ?? null,
    })

    importadas++
    if (vendaId) conciliadas++
  }

  return NextResponse.json({ importadas, duplicadas, conciliadas, pendentes: importadas - conciliadas })
}
