'use server'
import { db } from '@/lib/db'
import { conciliacoesCartao, pixRecebimentos, vendas, modelos, motos } from '@/lib/db/schema'
import { eq, and, desc, sql, isNull } from 'drizzle-orm'
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

function parseStone(text: string) {
  const lines = text.trim().split(/\r?\n/)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const c = lines[i].split(';')
    if (c[15]?.trim() !== 'Aprovada') continue

    const [dataPart] = (c[2] ?? '').split(' ')
    const [dd, mm, yyyy] = (dataPart ?? '').split('/')
    const produto = (c[4] ?? '').toLowerCase()

    rows.push({
      dataTransacao: `${yyyy}-${mm}-${dd}`,
      tipo:          produto.includes('debito') ? 'debito' as const : 'credito' as const,
      bandeira:      (c[3] ?? '').toLowerCase(),
      parcelas:      parseInt(c[6] ?? '1', 10) || 1,
      autorizacao:   c[5]?.trim() || null,   // STONE ID — aparece no comprovante
      valorBruto:    parseBRL(c[7] ?? '0'),
      valorLiquido:  parseBRL(c[8] ?? '0'),
      nsu:           c[5]?.trim() || null,   // STONE ID para deduplicação
      portador:      c[12]?.trim() || null,  // número do cartão mascarado
    })
  }
  return rows
}

// ── Actions ──────────────────────────────────────────────────────────────────

function detectarFormato(primeiraLinha: string): string | null {
  if (primeiraLinha.startsWith('Data e hora'))        return 'infinitypay'
  if (primeiraLinha.startsWith('Cod PagueVeloz') ||
      primeiraLinha.startsWith('Cod Pague'))           return 'pagueveloz'
  if (primeiraLinha.startsWith('DOCUMENTO;STONECODE')) return 'stone'
  return null
}

export async function importarRelatorioAction(formData: FormData) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) throw new Error('Sem permissão')

  const operadoraSelecionada = formData.get('operadora') as string
  const file = formData.get('file') as File
  if (!file || !operadoraSelecionada) throw new Error('Arquivo ou operadora não informados')

  // Tenta UTF-8; se falhar, tenta latin1 (comum em arquivos Windows brasileiros)
  let text: string
  try {
    const buf = await file.arrayBuffer()
    text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('latin1').decode(buf)
  } catch {
    text = await file.text()
  }

  // Auto-detecta o formato pelo cabeçalho
  const primeiraLinha = text.trim().split(/\r?\n/)[0] ?? ''
  const formatoDetectado = detectarFormato(primeiraLinha)
  const operadora = formatoDetectado ?? operadoraSelecionada

  if (formatoDetectado && formatoDetectado !== operadoraSelecionada) {
    console.log(`[conciliacao] formato detectado: ${formatoDetectado} (selecionado: ${operadoraSelecionada})`)
  }

  let rows: ReturnType<typeof parseInfinityPay> = []
  if (operadora === 'infinitypay')      rows = parseInfinityPay(text)
  else if (operadora === 'pagueveloz')  rows = parsePagueVeloz(text)
  else if (operadora === 'stone')       rows = parseStone(text)
  else throw new Error(`Formato não reconhecido. Verifique se o arquivo é da operadora correta.`)

  let importadas = 0
  let duplicadas = 0
  let conciliadas = 0

  for (const r of rows) {
    if (!r.valorBruto || r.valorBruto <= 0) continue

    // Evita duplicata por NSU (Stone, PagueVeloz)
    if (r.nsu) {
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(eq(conciliacoesCartao.operadora, operadora), eq(conciliacoesCartao.nsu, r.nsu)))
        .limit(1)
      if (ex) { duplicadas++; continue }
    } else {
      // InfinityPay: NSU mascarado — deduplica por (operadora, data, valor_bruto, tipo, parcelas)
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(
          eq(conciliacoesCartao.operadora,      operadora),
          isNull(conciliacoesCartao.nsu),
          eq(conciliacoesCartao.dataTransacao,  r.dataTransacao),
          sql`${conciliacoesCartao.valorBruto}::numeric = ${r.valorBruto}`,
          eq(conciliacoesCartao.tipo,           r.tipo),
          eq(conciliacoesCartao.parcelas,       r.parcelas),
        ))
        .limit(1)
      if (ex) { duplicadas++; continue }
    }

    // Tenta auto-conciliar pela autorização registrada na venda
    let vendaId: string | null = null
    if (r.autorizacao) {
      const [match] = await db
        .select({ id: vendas.id })
        .from(vendas)
        .where(sql`${vendas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`)
        .limit(1)
      if (match) vendaId = match.id
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
      ...(vendaId ? { vendaId, conciliado: true, conciliadoEm: new Date() } : {}),
    })

    if (vendaId) conciliadas++
    else importadas++
  }

  revalidatePath('/conciliacao')
  return { importadas, duplicadas, conciliadas }
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

export async function buscarConciliacoesDaVenda(vendaId: string) {
  const usuario = await getUsuarioLogado()

  // Verifica se o usuário tem acesso a essa venda
  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!venda) return []

  const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel) && venda.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão')
  }

  return db
    .select({
      id:            conciliacoesCartao.id,
      autorizacao:   conciliacoesCartao.autorizacao,
      valorBruto:    conciliacoesCartao.valorBruto,
      operadora:     conciliacoesCartao.operadora,
      tipo:          conciliacoesCartao.tipo,
      dataTransacao: conciliacoesCartao.dataTransacao,
    })
    .from(conciliacoesCartao)
    .where(and(eq(conciliacoesCartao.vendaId, vendaId), eq(conciliacoesCartao.conciliado, true)))
}

export async function buscarConciliacoesPorValor(valor: number) {
  const usuario = await getUsuarioLogado()
  const ADMINS  = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')

  return db
    .select({
      id:            conciliacoesCartao.id,
      operadora:     conciliacoesCartao.operadora,
      autorizacao:   conciliacoesCartao.autorizacao,
      valorBruto:    conciliacoesCartao.valorBruto,
      dataTransacao: conciliacoesCartao.dataTransacao,
      tipo:          conciliacoesCartao.tipo,
      rawData:       conciliacoesCartao.rawData,
    })
    .from(conciliacoesCartao)
    .where(
      and(
        sql`${conciliacoesCartao.vendaId} IS NULL`,
        sql`ABS(${conciliacoesCartao.valorBruto}::numeric - ${valor}) <= 0.05`,
      )
    )
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(10)
}

export async function buscarPixDaVenda(vendaId: string) {
  const usuario = await getUsuarioLogado()

  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1)
  if (!venda) return []

  const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel) && venda.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão')
  }

  return db
    .select({
      id:              pixRecebimentos.id,
      dataPagamento:   pixRecebimentos.dataPagamento,
      valor:           pixRecebimentos.valor,
      pagadorNome:     pixRecebimentos.pagadorNome,
      observacao:      pixRecebimentos.observacao,
    })
    .from(pixRecebimentos)
    .where(eq(pixRecebimentos.vendaId, vendaId))
}

export async function buscarVendasParaVincular(valorRef: number) {
  // Busca vendas onde algum lançamento de cartão tem valor exato (tolerância de R$0,01)
  return db
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
    .where(
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(${vendas.pagamentos}) AS p
        WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
        AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
      )`
    )
    .orderBy(desc(vendas.dataVenda))
    .limit(50)
}
