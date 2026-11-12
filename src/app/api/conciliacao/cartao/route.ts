import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { conciliacoesCartao, grupos } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { casarPorValor, lojaIdsDoGrupo } from '@/lib/conciliacao-casamento'
import { chaveDedup, type PayloadConciliacao } from '@/lib/conciliacao-cartao'
import { somenteDigitos } from '@/lib/grupo-cnpj'

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
  const lojaIdsGrupo = await lojaIdsDoGrupo(db, grupo.id)

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

    // Tenta casar com uma venda: mesmo dia ± 1 dia, valor bruto próximo, mesma qtd de parcelas.
    // Grupo sem loja cadastrada não tem como ter venda: nada a casar.
    const { vendaId, pecaVendaId, osId } = await casarPorValor(db, lojaIdsGrupo, t)

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
