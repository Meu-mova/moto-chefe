import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas, vendasPecas, ordensServico, grupos, lojas } from '@/lib/db/schema'
import { eq, and, between, inArray, sql } from 'drizzle-orm'
import { chaveDedup, type PayloadConciliacao } from '@/lib/conciliacao-cartao'
import { somenteDigitos } from '@/lib/grupo-cnpj'

const TOLERANCE = 0.05 // R$ 0,05 de tolerância no valor

type Pagamento = { tipo: string; valor: number; parcelas?: number }

const TIPOS_CARTAO = ['cartao_credito', 'cartao_debito', 'link_pagamento']

/** Um lançamento de cartão do mesmo valor (±R$ 0,05) e mesmas parcelas. */
function casaPagamento(pagamentos: unknown, valorBruto: number, parcelas: number): boolean {
  const pgtos = (pagamentos ?? []) as Pagamento[]
  return pgtos.some(p =>
    TIPOS_CARTAO.includes(p.tipo) &&
    Math.abs(p.valor - valorBruto) <= TOLERANCE &&
    (!p.parcelas || p.parcelas === parcelas)
  )
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PayloadConciliacao
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const { operadora, grupoCnpj, transacoes } = body

  if (!operadora || typeof grupoCnpj !== 'string' || !grupoCnpj ||
      !Array.isArray(transacoes) || transacoes.length === 0) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // O grupo vem do payload, nunca do dado: cada grupo tem sua própria conta na
  // operadora, e adivinhar pelo conteúdo já colocou transação de BH em Sul de
  // Minas uma vez. A comparação é por dígitos — ver src/lib/grupo-cnpj.ts.
  const [grupo] = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(sql`regexp_replace(${grupos.cnpj}, '[^0-9]', '', 'g') = ${somenteDigitos(grupoCnpj)}`)
    .limit(1)

  if (!grupo) {
    return NextResponse.json({ error: `Grupo não encontrado para o CNPJ ${grupoCnpj}` }, { status: 400 })
  }

  // Sem isto o casamento varre a base inteira: uma transação do Sul de Minas
  // casa com uma venda de BH de mesmo valor, mesmas parcelas e ±1 dia — comum
  // em peça e OS. O caminho do CSV (conciliacao/actions.ts) já restringe assim.
  const lojasDoGrupo = await db
    .select({ id: lojas.id })
    .from(lojas)
    .where(eq(lojas.grupoId, grupo.id))
  const lojaIdsGrupo = lojasDoGrupo.map(l => l.id)

  let importadas = 0
  let duplicadas = 0
  let conciliadas = 0

  for (const t of transacoes) {
    // Ignora transações não aprovadas. `status` ausente não pode derrubar o
    // lote inteiro: sem status a transação simplesmente não entra.
    const status = typeof t.status === 'string' ? t.status.toLowerCase() : ''
    if (!['aprovado', 'approved', 'captured', 'capturada'].includes(status)) continue

    // Duplicata: NSU é a chave natural; a Stone não manda NSU, então o id da
    // operadora (guardado em rawData) evita reinserir a mesma venda a cada rodada.
    // O filtro de grupo é obrigatório: NSU sequencial de grupos diferentes pode
    // coincidir e descartar em silêncio uma transação de verdade como duplicada.
    const chave = chaveDedup(t)
    if (chave) {
      const condicao = chave.campo === 'nsu'
        ? eq(conciliacoesCartao.nsu, chave.valor)
        : sql`${conciliacoesCartao.rawData}->>'id' = ${chave.valor}`

      const [existente] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(
          eq(conciliacoesCartao.grupoId, grupo.id),
          eq(conciliacoesCartao.operadora, operadora),
          condicao,
        ))
        .limit(1)
      if (existente) { duplicadas++; continue }
    }

    // Tenta casar com uma venda: mesmo dia ± 1 dia, valor bruto próximo, mesma qtd de parcelas
    const dataBase = new Date(t.dataTransacao + 'T12:00:00Z')
    const dataMin = new Date(dataBase); dataMin.setDate(dataMin.getDate() - 1)
    const dataMax = new Date(dataBase); dataMax.setDate(dataMax.getDate() + 1)

    let vendaId: string | null = null
    let pecaVendaId: string | null = null
    let osId: string | null = null

    // Grupo sem loja cadastrada não tem como ter venda: nada a casar.
    if (lojaIdsGrupo.length > 0) {
      const vendasCandidatas = await db
        .select({ id: vendas.id, pagamentos: vendas.pagamentos })
        .from(vendas)
        .where(and(
          between(vendas.dataVenda, dataMin, dataMax),
          inArray(vendas.lojaId, lojaIdsGrupo),
        ))

      vendaId = vendasCandidatas.find(v => casaPagamento(v.pagamentos, t.valorBruto, t.parcelas))?.id ?? null

      // Se não casou com venda de moto, tenta venda de peças/acessórios (mesma tolerância)
      if (!vendaId) {
        const pecasCandidatas = await db
          .select({ id: vendasPecas.id, pagamentos: vendasPecas.pagamentos })
          .from(vendasPecas)
          .where(and(
            between(vendasPecas.dataVenda, dataMin, dataMax),
            inArray(vendasPecas.lojaId, lojaIdsGrupo),
          ))

        pecaVendaId = pecasCandidatas.find(v => casaPagamento(v.pagamentos, t.valorBruto, t.parcelas))?.id ?? null
      }

      // Se também não casou com peça, tenta Ordem de Serviço (mesma tolerância)
      if (!vendaId && !pecaVendaId) {
        const osCandidatas = await db
          .select({ id: ordensServico.id, pagamentos: ordensServico.pagamentos })
          .from(ordensServico)
          .where(and(
            between(ordensServico.dataConclusao, dataMin, dataMax),
            inArray(ordensServico.lojaId, lojaIdsGrupo),
          ))

        osId = osCandidatas.find(v => casaPagamento(v.pagamentos, t.valorBruto, t.parcelas))?.id ?? null
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
