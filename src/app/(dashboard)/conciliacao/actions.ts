'use server'
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas, modelos, motos } from '@/lib/db/schema'
import { eq, and, between, or, ilike, desc } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// ── Parser CSV InfinityPay ────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += ch }
  }
  result.push(current.trim())
  return result
}

function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0
}

function parseInfinityPay(text: string) {
  const lines = text.trim().split(/\r?\n/)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const c = parseCSVLine(lines[i])
    // c[7] = Status, c[1] = Meio
    if (c[7] !== 'Aprovada') continue
    if (!['Crédito', 'Débito'].includes(c[1])) continue

    const [dd, mm, yyyy] = (c[0].split(' ')[0]).split('/')
    rows.push({
      dataTransacao: `${yyyy}-${mm}-${dd}`,
      tipo:          c[1] === 'Débito' ? 'debito' : 'credito',
      bandeira:      c[2],
      parcelas:      c[3] === 'À Vista' ? 1 : (parseInt(c[3], 10) || 1),
      autorizacao:   c[6] !== '000000' ? c[6] : null,
      valorBruto:    parseBRL(c[8]),
      valorLiquido:  parseBRL(c[9]),
      nsu:           c[13] || null,
      portador:      c[14] || null,
    })
  }
  return rows
}

function parsePagueVeloz(text: string) {
  const lines = text.trim().split(/\r?\n/)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const c = lines[i].split(';')
    if (c[14]?.trim() !== 'Pago') continue

    const [dd, mm, yyyy] = (c[7] ?? '').split('/')
    rows.push({
      dataTransacao: `${yyyy}-${mm}-${dd}`,
      tipo:          'credito' as const,
      bandeira:      (c[10] ?? '').toLowerCase(),
      parcelas:      parseInt(c[11] ?? '1', 10) || 1,
      autorizacao:   c[3]?.trim() || null,
      valorBruto:    parseBRL(c[12] ?? '0'),
      valorLiquido:  parseBRL(c[13] ?? '0'),
      nsu:           c[0]?.trim() || null,  // Cod PagueVeloz é o ID único
      portador:      c[5]?.trim() || null,
    })
  }
  return rows
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function importarRelatorioAction(formData: FormData) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new Error('Sem permissão')

  const operadora = formData.get('operadora') as string
  const file = formData.get('file') as File
  if (!file || !operadora) throw new Error('Arquivo ou operadora não informados')

  const text = await file.text()

  let rows: ReturnType<typeof parseInfinityPay> = []
  if (operadora === 'infinitypay')  rows = parseInfinityPay(text)
  else if (operadora === 'pagueveloz') rows = parsePagueVeloz(text)
  // stone: parser adicionado quando tivermos amostra
  else throw new Error(`Parser para ${operadora} ainda não implementado`)

  let importadas = 0
  let duplicadas = 0

  for (const r of rows) {
    if (!r.valorBruto || r.valorBruto <= 0) continue

    // Evita duplicata por NSU
    if (r.nsu) {
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(eq(conciliacoesCartao.operadora, operadora), eq(conciliacoesCartao.nsu, r.nsu)))
        .limit(1)
      if (ex) { duplicadas++; continue }
    }

    await db.insert(conciliacoesCartao).values({
      operadora,
      dataTransacao:  r.dataTransacao,
      nsu:            r.nsu,
      autorizacao:    r.autorizacao,
      valorBruto:     String(r.valorBruto),
      valorLiquido:   r.valorLiquido != null ? String(r.valorLiquido) : null,
      parcelas:       r.parcelas,
      tipo:           r.tipo,
      status:         'aprovado',
      rawData:        { bandeira: r.bandeira, portador: r.portador },
    })
    importadas++
  }

  revalidatePath('/conciliacao')
  return { importadas, duplicadas }
}

export async function vincularVendaAction(conciliacaoId: string, vendaId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new Error('Sem permissão')

  await db.update(conciliacoesCartao)
    .set({ vendaId, conciliado: true, conciliadoEm: new Date() })
    .where(eq(conciliacoesCartao.id, conciliacaoId))

  revalidatePath('/conciliacao')
}

export async function desvincularVendaAction(conciliacaoId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new Error('Sem permissão')

  await db.update(conciliacoesCartao)
    .set({ vendaId: null, conciliado: false, conciliadoEm: null })
    .where(eq(conciliacoesCartao.id, conciliacaoId))

  revalidatePath('/conciliacao')
}

export async function buscarVendasParaVincular(dataRef: string, valorRef: number) {
  // Busca vendas com cartão ± 5 dias e valor próximo (±20%)
  const base = new Date(dataRef + 'T12:00:00Z')
  const dMin = new Date(base); dMin.setDate(dMin.getDate() - 5)
  const dMax = new Date(base); dMax.setDate(dMax.getDate() + 5)
  const vMin = valorRef * 0.8
  const vMax = valorRef * 1.2

  const rows = await db
    .select({
      id:             vendas.id,
      numero:         vendas.numero,
      dataVenda:      vendas.dataVenda,
      clienteNome:    vendas.clienteNome,
      valor:          vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos:     vendas.pagamentos,
    })
    .from(vendas)
    .where(between(vendas.dataVenda, dMin, dMax))
    .orderBy(desc(vendas.dataVenda))

  return rows.filter(v => {
    const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number }[]
    return pgtos.some(p =>
      ['cartao_credito', 'cartao_debito', 'link_pagamento'].includes(p.tipo) &&
      p.valor >= vMin && p.valor <= vMax
    )
  })
}
