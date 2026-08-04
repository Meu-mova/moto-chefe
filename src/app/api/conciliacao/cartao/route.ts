import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas, vendasPecas, ordensServico, grupos } from '@/lib/db/schema'
import { eq, and, between, sql } from 'drizzle-orm'
import { chaveDedup, type PayloadConciliacao } from '@/lib/conciliacao-cartao'

const TOLERANCE = 0.05 // R$ 0,05 de tolerância no valor

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: PayloadConciliacao = await req.json()
  const { operadora, grupoCnpj, transacoes } = body

  if (!operadora || !grupoCnpj || !Array.isArray(transacoes) || transacoes.length === 0) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // O grupo vem do payload, nunca do dado: cada grupo tem sua própria conta na
  // operadora, e adivinhar pelo conteúdo já colocou transação de BH em Sul de
  // Minas uma vez.
  const [grupo] = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(eq(grupos.cnpj, grupoCnpj))
    .limit(1)

  if (!grupo) {
    return NextResponse.json({ error: `Grupo não encontrado para o CNPJ ${grupoCnpj}` }, { status: 400 })
  }

  let importadas = 0
  let duplicadas = 0
  let conciliadas = 0

  for (const t of transacoes) {
    // Ignora transações não aprovadas
    if (!['aprovado', 'approved', 'captured', 'capturada'].includes(t.status.toLowerCase())) continue

    // Duplicata: NSU é a chave natural; a Stone não manda NSU, então o id da
    // operadora (guardado em rawData) evita reinserir a mesma venda a cada rodada.
    const chave = chaveDedup(t)
    if (chave) {
      const condicao = chave.campo === 'nsu'
        ? eq(conciliacoesCartao.nsu, chave.valor)
        : sql`${conciliacoesCartao.rawData}->>'id' = ${chave.valor}`

      const [existente] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(eq(conciliacoesCartao.operadora, operadora), condicao))
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

    // Se não casou com venda de moto, tenta venda de peças/acessórios (mesma tolerância)
    let pecaVendaId: string | null = null
    if (!vendaId) {
      const pecasCandidatas = await db
        .select({ id: vendasPecas.id, pagamentos: vendasPecas.pagamentos })
        .from(vendasPecas)
        .where(between(vendasPecas.dataVenda, dataMin, dataMax))

      for (const v of pecasCandidatas) {
        const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
        const pgtoCartao = pgtos.find(p =>
          ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
          Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
          (!p.parcelas || p.parcelas === t.parcelas)
        )
        if (pgtoCartao) { pecaVendaId = v.id; break }
      }
    }

    // Se também não casou com peça, tenta Ordem de Serviço (mesma tolerância)
    let osId: string | null = null
    if (!vendaId && !pecaVendaId) {
      const osCandidatas = await db
        .select({ id: ordensServico.id, pagamentos: ordensServico.pagamentos })
        .from(ordensServico)
        .where(between(ordensServico.dataConclusao, dataMin, dataMax))

      for (const v of osCandidatas) {
        const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number; parcelas?: number }[]
        const pgtoCartao = pgtos.find(p =>
          ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
          Math.abs(p.valor - t.valorBruto) <= TOLERANCE &&
          (!p.parcelas || p.parcelas === t.parcelas)
        )
        if (pgtoCartao) { osId = v.id; break }
      }
    }

    const matched = vendaId ?? pecaVendaId ?? osId
    await db.insert(conciliacoesCartao).values({
      grupoId: grupo.id,
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
      pecaVendaId: pecaVendaId ?? undefined,
      osId: osId ?? undefined,
      conciliado: matched !== null,
      conciliadoEm: matched !== null ? new Date() : null,
      rawData: t.rawData ?? null,
    })

    importadas++
    if (matched) conciliadas++
  }

  return NextResponse.json({ importadas, duplicadas, conciliadas, pendentes: importadas - conciliadas })
}
