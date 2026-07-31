'use server'
import { db } from '@/lib/db'
import { conciliacoesCartao, pixRecebimentos, pixRecebimentosMcp, vendas, modelos, motos, vendasPecas, ordensServico, clientes } from '@/lib/db/schema'
import { eq, and, desc, sql, isNull, ilike, inArray } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { CORTE_MIGRACAO_PIX } from '@/lib/pix'
import { pagamentosEfetivosOS, precisaConciliar, type PgtoOS } from '@/lib/conciliacao-status'
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
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

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
        .where(and(
          eq(conciliacoesCartao.grupoId, grupo.id),
          eq(conciliacoesCartao.operadora, operadora),
          eq(conciliacoesCartao.nsu, r.nsu),
        ))
        .limit(1)
      if (ex) { duplicadas++; continue }
    } else {
      // InfinityPay: NSU mascarado — deduplica por (operadora, data, valor_bruto, tipo, parcelas)
      const [ex] = await db
        .select({ id: conciliacoesCartao.id })
        .from(conciliacoesCartao)
        .where(and(
          eq(conciliacoesCartao.grupoId,        grupo.id),
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

    // Tenta auto-conciliar pela autorização registrada na venda (moto, peça ou OS), restrito ao grupo ativo
    let vendaId: string | null = null
    let pecaVendaId: string | null = null
    let osId: string | null = null
    if (r.autorizacao) {
      const [matchVenda] = await db
        .select({ id: vendas.id })
        .from(vendas)
        .where(and(
          sql`${vendas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
          inArray(vendas.lojaId, lojaIdsGrupo),
        ))
        .limit(1)
      if (matchVenda) {
        vendaId = matchVenda.id
      } else {
        const [matchPeca] = await db
          .select({ id: vendasPecas.id })
          .from(vendasPecas)
          .where(and(
            sql`${vendasPecas.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
            inArray(vendasPecas.lojaId, lojaIdsGrupo),
          ))
          .limit(1)
        if (matchPeca) {
          pecaVendaId = matchPeca.id
        } else {
          const [matchOs] = await db
            .select({ id: ordensServico.id })
            .from(ordensServico)
            .where(and(
              sql`${ordensServico.pagamentos} @> ${JSON.stringify([{ autorizacao: r.autorizacao }])}::jsonb`,
              inArray(ordensServico.lojaId, lojaIdsGrupo),
            ))
            .limit(1)
          if (matchOs) osId = matchOs.id
        }
      }
    }

    const matched = vendaId ?? pecaVendaId ?? osId
    await db.insert(conciliacoesCartao).values({
      grupoId:        grupo.id,
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
      ...(matched ? { vendaId, pecaVendaId, osId, conciliado: true, conciliadoEm: new Date() } : {}),
    })

    if (matched) conciliadas++
    else importadas++
  }

  revalidatePath('/conciliacao')
  return { importadas, duplicadas, conciliadas }
}

export async function vincularVendaAction(conciliacaoId: string, alvoId: string, tipo: 'moto' | 'peca' | 'os' = 'moto') {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  if (tipo === 'peca') {
    const [pecaVenda] = await db.select({ lojaId: vendasPecas.lojaId }).from(vendasPecas).where(eq(vendasPecas.id, alvoId)).limit(1)
    if (!pecaVenda || !lojaIdsGrupo.includes(pecaVenda.lojaId)) {
      throw new Error('Venda de peça não pertence ao grupo ativo')
    }
    const atualizadas = await db.update(conciliacoesCartao)
      .set({ pecaVendaId: alvoId, vendaId: null, osId: null, conciliado: true, conciliadoEm: new Date() })
      .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
      .returning({ id: conciliacoesCartao.id })
    if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')
    revalidatePath('/conciliacao')
    return
  }

  if (tipo === 'os') {
    const [os] = await db.select({ lojaId: ordensServico.lojaId }).from(ordensServico).where(eq(ordensServico.id, alvoId)).limit(1)
    if (!os || !lojaIdsGrupo.includes(os.lojaId)) {
      throw new Error('Ordem de serviço não pertence ao grupo ativo')
    }
    const atualizadas = await db.update(conciliacoesCartao)
      .set({ osId: alvoId, vendaId: null, pecaVendaId: null, conciliado: true, conciliadoEm: new Date() })
      .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
      .returning({ id: conciliacoesCartao.id })
    if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')
    revalidatePath('/conciliacao')
    return
  }

  // Garante que a venda a ser vinculada pertence a uma loja do grupo ativo
  const [venda] = await db
    .select({ lojaId: vendas.lojaId })
    .from(vendas)
    .where(eq(vendas.id, alvoId))
    .limit(1)
  if (!venda || !lojaIdsGrupo.includes(venda.lojaId)) {
    throw new Error('Venda não pertence ao grupo ativo')
  }

  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: alvoId, pecaVendaId: null, osId: null, conciliado: true, conciliadoEm: new Date() })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })

  if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')

  revalidatePath('/conciliacao')
}

export async function desvincularVendaAction(conciliacaoId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const atualizadas = await db.update(conciliacoesCartao)
    .set({ vendaId: null, pecaVendaId: null, osId: null, conciliado: false, conciliadoEm: null })
    .where(and(eq(conciliacoesCartao.id, conciliacaoId), eq(conciliacoesCartao.grupoId, grupo.id)))
    .returning({ id: conciliacoesCartao.id })

  if (atualizadas.length === 0) throw new Error('Conciliação não encontrada')

  revalidatePath('/conciliacao')
}

export async function buscarConciliacoesPorValor(valor: number) {
  const usuario = await getUsuarioLogado()
  const ADMINS  = ['admin_geral', 'admin_socio', 'aux_adm']
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

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
        eq(conciliacoesCartao.grupoId, grupo.id),
        sql`${conciliacoesCartao.vendaId} IS NULL`,
        sql`ABS(${conciliacoesCartao.valorBruto}::numeric - ${valor}) <= 0.05`,
      )
    )
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(10)
}

// ─── Conciliação por alvo (venda de moto, peça ou OS) ────────────────────────
// As telas de vendas, peças e OS mostram o mesmo painel de pagamentos, então
// carregam os lançamentos pelas mesmas funções — ver src/components/pagamentos-conciliacao.tsx.

export type AlvoTipo = 'moto' | 'peca' | 'os'
export type AlvoConciliacao = { tipo: AlvoTipo; id: string }

const GESTORES_CONC = ['admin_geral', 'admin_socio', 'aux_adm']

async function lojaIdDoAlvo(alvo: AlvoConciliacao): Promise<string | null> {
  if (alvo.tipo === 'peca') {
    const [r] = await db.select({ lojaId: vendasPecas.lojaId }).from(vendasPecas).where(eq(vendasPecas.id, alvo.id)).limit(1)
    return r?.lojaId ?? null
  }
  if (alvo.tipo === 'os') {
    const [r] = await db.select({ lojaId: ordensServico.lojaId }).from(ordensServico).where(eq(ordensServico.id, alvo.id)).limit(1)
    return r?.lojaId ?? null
  }
  const [r] = await db.select({ lojaId: vendas.lojaId }).from(vendas).where(eq(vendas.id, alvo.id)).limit(1)
  return r?.lojaId ?? null
}

export async function buscarConciliacoesDoAlvo(alvo: AlvoConciliacao) {
  const usuario = await getUsuarioLogado()
  const lojaId  = await lojaIdDoAlvo(alvo)
  if (!lojaId) return []
  if (!GESTORES_CONC.includes(usuario.papel) && lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  const coluna = alvo.tipo === 'peca' ? conciliacoesCartao.pecaVendaId
    : alvo.tipo === 'os'              ? conciliacoesCartao.osId
    :                                   conciliacoesCartao.vendaId

  return db
    .select({
      id:            conciliacoesCartao.id,
      autorizacao:   conciliacoesCartao.autorizacao,
      valorBruto:    conciliacoesCartao.valorBruto,
      valorLiquido:  conciliacoesCartao.valorLiquido,
      operadora:     conciliacoesCartao.operadora,
      tipo:          conciliacoesCartao.tipo,
      dataTransacao: conciliacoesCartao.dataTransacao,
    })
    .from(conciliacoesCartao)
    .where(and(eq(coluna, alvo.id), eq(conciliacoesCartao.conciliado, true)))
}

export async function buscarPixDoAlvo(alvo: AlvoConciliacao) {
  const usuario = await getUsuarioLogado()
  const lojaId  = await lojaIdDoAlvo(alvo)
  if (!lojaId) return []
  if (!GESTORES_CONC.includes(usuario.papel) && lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  // Venda de moto anterior ao corte ainda concilia pelo ValidaPix; OS e peça sempre
  // pelo mcp.ai (nasceram depois da migração). Ver CORTE_MIGRACAO_PIX.
  if (alvo.tipo === 'moto') {
    const [venda] = await db.select({ dataVenda: vendas.dataVenda }).from(vendas).where(eq(vendas.id, alvo.id)).limit(1)
    if (venda && new Date(venda.dataVenda) < CORTE_MIGRACAO_PIX) {
      return db
        .select({
          id:            pixRecebimentos.id,
          dataPagamento: pixRecebimentos.dataPagamento,
          valor:         pixRecebimentos.valor,
          pagadorNome:   pixRecebimentos.pagadorNome,
          observacao:    pixRecebimentos.observacao,
        })
        .from(pixRecebimentos)
        .where(eq(pixRecebimentos.vendaId, alvo.id))
    }
  }

  const coluna = alvo.tipo === 'peca' ? pixRecebimentosMcp.pecaVendaId
    : alvo.tipo === 'os'              ? pixRecebimentosMcp.osId
    :                                   pixRecebimentosMcp.vendaId

  return db
    .select({
      id:            pixRecebimentosMcp.id,
      dataPagamento: pixRecebimentosMcp.data,
      valor:         pixRecebimentosMcp.valor,
      pagadorNome:   pixRecebimentosMcp.pagadorNome,
      observacao:    pixRecebimentosMcp.descricao,
    })
    .from(pixRecebimentosMcp)
    .where(eq(coluna, alvo.id))
}

// Busca livre: a lupa padrão só acha transação de valor praticamente idêntico. Quando
// o valor lançado na venda não bate com o que a operadora reportou (taxa embutida,
// digitação errada), é por aqui que se acha a transação — por autorização, NSU, data
// ou valor aproximado, sem filtro de valor exato.
export async function buscarConciliacoesLivres(query: string) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES_CONC.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const q = query.trim()
  if (q.length < 2) return []

  const valor   = parseFloat(q.replace(/\./g, '').replace(',', '.'))
  const isData  = /^\d{4}-\d{2}-\d{2}$/.test(q)
  const isValor = !isData && Number.isFinite(valor) && valor > 0

  const filtro = isData
    ? eq(conciliacoesCartao.dataTransacao, q)
    : isValor
      ? sql`ABS(${conciliacoesCartao.valorBruto}::numeric - ${valor}) <= 5`
      : sql`(${conciliacoesCartao.autorizacao} ILIKE ${'%' + q + '%'} OR ${conciliacoesCartao.nsu} ILIKE ${'%' + q + '%'})`

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
    .where(and(
      eq(conciliacoesCartao.grupoId, grupo.id),
      eq(conciliacoesCartao.conciliado, false),
      filtro,
    ))
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(15)
}

// ─── Forçar conciliação na mão (admin_geral) ─────────────────────────────────
// Fecha a pendência quando o dinheiro entrou mas não existe lançamento no sistema.
// A marcação mora no próprio item do array `pagamentos` — ver
// docs/superpowers/specs/2026-07-31-forcar-conciliacao-design.md.

async function alvoParaEdicao(alvo: AlvoConciliacao) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') throw new Error('Sem permissão')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  if (alvo.tipo === 'peca') {
    const [r] = await db
      .select({ lojaId: vendasPecas.lojaId, pagamentos: vendasPecas.pagamentos })
      .from(vendasPecas).where(eq(vendasPecas.id, alvo.id)).limit(1)
    if (!r) throw new Error('Venda de peça não encontrada')
    if (!lojaIdsGrupo.includes(r.lojaId)) throw new Error('Venda de peça não pertence ao grupo ativo')
    return { usuario, pgtos: ((r.pagamentos ?? []) as PgtoOS[]) }
  }

  if (alvo.tipo === 'os') {
    const [r] = await db
      .select({
        lojaId:         ordensServico.lojaId,
        pagamentos:     ordensServico.pagamentos,
        formaPagamento: ordensServico.formaPagamento,
        valorTotal:     ordensServico.valorTotal,
      })
      .from(ordensServico).where(eq(ordensServico.id, alvo.id)).limit(1)
    if (!r) throw new Error('Ordem de serviço não encontrada')
    if (!lojaIdsGrupo.includes(r.lojaId)) throw new Error('Ordem de serviço não pertence ao grupo ativo')
    // OS antiga só tem `formaPagamento` em texto — materializa o array sintetizado
    // para que a marcação tenha onde morar.
    return { usuario, pgtos: pagamentosEfetivosOS(r.formaPagamento, r.pagamentos, r.valorTotal) }
  }

  const [r] = await db
    .select({ lojaId: vendas.lojaId, pagamentos: vendas.pagamentos })
    .from(vendas).where(eq(vendas.id, alvo.id)).limit(1)
  if (!r) throw new Error('Venda não encontrada')
  if (!lojaIdsGrupo.includes(r.lojaId)) throw new Error('Venda não pertence ao grupo ativo')
  return { usuario, pgtos: ((r.pagamentos ?? []) as PgtoOS[]) }
}

async function gravarPagamentos(alvo: AlvoConciliacao, pgtos: PgtoOS[]) {
  if (alvo.tipo === 'peca') {
    await db.update(vendasPecas).set({ pagamentos: pgtos }).where(eq(vendasPecas.id, alvo.id))
  } else if (alvo.tipo === 'os') {
    await db.update(ordensServico).set({ pagamentos: pgtos }).where(eq(ordensServico.id, alvo.id))
    revalidatePath(`/ordens-servico/${alvo.id}`)
  } else {
    await db.update(vendas).set({ pagamentos: pgtos }).where(eq(vendas.id, alvo.id))
  }

  // O mesmo status aparece em 6 telas; todas revalidam juntas para nunca divergirem.
  revalidatePath('/vendas')
  revalidatePath('/pecas')
  revalidatePath('/ordens-servico')
  revalidatePath('/dashboard')
  revalidatePath('/conciliacao')
}

export async function forcarConciliacaoAction(alvo: AlvoConciliacao, idx: number, motivo: string) {
  const texto = motivo.trim()
  if (texto.length < 3) throw new Error('Informe o motivo da conciliação forçada')

  const { usuario, pgtos } = await alvoParaEdicao(alvo)
  const alvoPgto = pgtos[idx]
  if (!alvoPgto) throw new Error('Pagamento não encontrado')
  if (!precisaConciliar(alvoPgto.tipo)) throw new Error('Esse pagamento não precisa de conciliação')

  const atualizados = pgtos.map((p, i) => i === idx
    ? {
        ...p,
        conciliadoManual: {
          motivo:  texto,
          porId:   usuario.id,
          porNome: usuario.nome,
          em:      new Date().toISOString(),
        },
      }
    : p)

  await gravarPagamentos(alvo, atualizados)
}

export async function desfazerConciliacaoForcadaAction(alvo: AlvoConciliacao, idx: number) {
  const { pgtos } = await alvoParaEdicao(alvo)
  if (!pgtos[idx]) throw new Error('Pagamento não encontrado')

  const atualizados = pgtos.map((p, i) => {
    if (i !== idx) return p
    const { conciliadoManual: _removido, ...resto } = p
    return resto
  })

  await gravarPagamentos(alvo, atualizados)
}

export async function buscarVendasParaVincular(valorRef: number) {
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  // Busca vendas (motos e peças/acessórios) onde algum lançamento de cartão tem valor
  // exato (tolerância de R$0,01), restrito às lojas do grupo ativo do usuário.
  const [motosRows, pecasRows, osRows] = await Promise.all([
    db
      .select({
        id:             vendas.id,
        tipo:           sql<'moto'>`'moto'`,
        numero:         vendas.numero,
        dataVenda:      vendas.dataVenda,
        clienteNome:    vendas.clienteNome,
        valor:          vendas.valor,
        formaPagamento: vendas.formaPagamento,
        pagamentos:     vendas.pagamentos,
      })
      .from(vendas)
      .where(
        and(
          inArray(vendas.lojaId, lojaIdsGrupo),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${vendas.pagamentos}) AS p
            WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
            AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
          )`,
        )
      )
      .orderBy(desc(vendas.dataVenda))
      .limit(50),
    db
      .select({
        id:             vendasPecas.id,
        tipo:           sql<'peca'>`'peca'`,
        numero:         vendasPecas.numero,
        dataVenda:      vendasPecas.dataVenda,
        clienteNome:    sql<string>`COALESCE(${vendasPecas.clienteNome}, 'Cliente não identificado')`,
        valor:          vendasPecas.valorTotal,
        formaPagamento: vendasPecas.formaPagamento,
        pagamentos:     vendasPecas.pagamentos,
      })
      .from(vendasPecas)
      .where(
        and(
          inArray(vendasPecas.lojaId, lojaIdsGrupo),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${vendasPecas.pagamentos}) AS p
            WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
            AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
          )`,
        )
      )
      .orderBy(desc(vendasPecas.dataVenda))
      .limit(50),
    db
      .select({
        id:             ordensServico.id,
        tipo:           sql<'os'>`'os'`,
        numero:         ordensServico.numero,
        dataVenda:      ordensServico.dataConclusao,
        clienteNome:    sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:          ordensServico.valorTotal,
        formaPagamento: ordensServico.formaPagamento,
        pagamentos:     ordensServico.pagamentos,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(
        and(
          inArray(ordensServico.lojaId, lojaIdsGrupo),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${ordensServico.pagamentos}) AS p
            WHERE (p->>'valor')::numeric BETWEEN ${valorRef - 0.01} AND ${valorRef + 0.01}
            AND p->>'tipo' IN ('cartao_credito', 'cartao_debito', 'link_pagamento')
          )`,
        )
      )
      .orderBy(desc(ordensServico.dataConclusao))
      .limit(50),
  ])

  return [...motosRows, ...pecasRows, ...osRows]
}

export async function buscarVendaManual(query: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) throw new Error('Sem permissão')
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const q = query.trim()
  if (q.length < 2) return []

  const isNumero = /^\d{1,7}$/.test(q)

  const [motosRows, pecasRows, osRows] = await Promise.all([
    db
      .select({
        id:             vendas.id,
        tipo:           sql<'moto'>`'moto'`,
        numero:         vendas.numero,
        dataVenda:      vendas.dataVenda,
        clienteNome:    vendas.clienteNome,
        valor:          vendas.valor,
        formaPagamento: vendas.formaPagamento,
        pagamentos:     vendas.pagamentos,
      })
      .from(vendas)
      .where(
        and(
          inArray(vendas.lojaId, lojaIdsGrupo),
          isNumero ? eq(vendas.numero, parseInt(q, 10)) : ilike(vendas.clienteNome, `%${q}%`),
        )
      )
      .orderBy(desc(vendas.dataVenda))
      .limit(15),
    db
      .select({
        id:             vendasPecas.id,
        tipo:           sql<'peca'>`'peca'`,
        numero:         vendasPecas.numero,
        dataVenda:      vendasPecas.dataVenda,
        clienteNome:    sql<string>`COALESCE(${vendasPecas.clienteNome}, 'Cliente não identificado')`,
        valor:          vendasPecas.valorTotal,
        formaPagamento: vendasPecas.formaPagamento,
        pagamentos:     vendasPecas.pagamentos,
      })
      .from(vendasPecas)
      .where(
        and(
          inArray(vendasPecas.lojaId, lojaIdsGrupo),
          isNumero ? eq(vendasPecas.numero, parseInt(q, 10)) : ilike(sql`COALESCE(${vendasPecas.clienteNome}, '')`, `%${q}%`),
        )
      )
      .orderBy(desc(vendasPecas.dataVenda))
      .limit(15),
    db
      .select({
        id:             ordensServico.id,
        tipo:           sql<'os'>`'os'`,
        numero:         ordensServico.numero,
        dataVenda:      ordensServico.dataConclusao,
        clienteNome:    sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:          ordensServico.valorTotal,
        formaPagamento: ordensServico.formaPagamento,
        pagamentos:     ordensServico.pagamentos,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(
        and(
          inArray(ordensServico.lojaId, lojaIdsGrupo),
          isNumero
            ? eq(ordensServico.numero, parseInt(q, 10))
            : sql`(COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, '') ILIKE ${'%' + q + '%'})`,
        )
      )
      .orderBy(desc(ordensServico.dataConclusao))
      .limit(15),
  ])

  return [...motosRows, ...pecasRows, ...osRows]
}
