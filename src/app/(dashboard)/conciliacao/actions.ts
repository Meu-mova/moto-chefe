'use server'
import { maquininhasDoGrupo } from '@/lib/maquininhas'
import { db } from '@/lib/db'
import { conciliacoesCartao, pixRecebimentosMcp, vendas, modelos, motos, vendasPecas, ordensServico, clientes } from '@/lib/db/schema'
import { eq, and, or, desc, gte, sql, isNull, ilike, inArray } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { INICIO_CONCILIACAO, INICIO_CONCILIACAO_EM } from '@/lib/conciliacao-periodo'
import { ehTransferenciaInterna } from '@/lib/pix-internos'
import { pagamentosEfetivosOS, precisaConciliar, type PgtoOS } from '@/lib/conciliacao-status'
import { extrairTerminalInfinityPay, padraoNsuDoTerminal } from '@/lib/conciliacao-terminal'
import { grupos } from '@/lib/db/schema'
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
      terminal:      extrairTerminalInfinityPay(c[5]),
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
      terminal:      null,                  // PagueVeloz não identifica o aparelho no arquivo
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
      // Serial da maquininha (coluna "N DE SÉRIE"). Vazio em venda por e-commerce,
      // que não passa por aparelho. Usado pra barrar arquivo no grupo errado.
      terminal:      c[14]?.trim() || null,
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
  if (!(await maquininhasDoGrupo(db, grupo.id)).some(m => m.operadora === operadora)) {
    throw new Error('Maquininha não encontrada')
  }

  // ── Trava de grupo errado ───────────────────────────────────────────────────
  // A importação carimba o grupo ATIVO na sessão. Se o arquivo for de outro
  // grupo, as transações ficam presas onde nenhuma venda pode alcançá-las — foi
  // o que aconteceu com uma transação de BH importada em Sul de Minas.
  // Cada maquininha pertence a um grupo, então o serial do aparelho denuncia o
  // engano antes de gravar qualquer coisa. O serial é achado por dois caminhos:
  // na InfinityPay ele vem embutido no NSU; na Stone vem na coluna própria e é
  // guardado em rawData.serial. (A PagueVeloz não traz serial no arquivo.)
  const terminais = [...new Set(rows.map(r => r.terminal).filter((t): t is string => !!t))]
  for (const terminal of terminais) {
    const vistos = await db
      .selectDistinct({ grupoId: conciliacoesCartao.grupoId, grupoNome: grupos.nome })
      .from(conciliacoesCartao)
      .innerJoin(grupos, eq(conciliacoesCartao.grupoId, grupos.id))
      .where(or(
        ilike(conciliacoesCartao.nsu, padraoNsuDoTerminal(terminal)),
        eq(sql`${conciliacoesCartao.rawData}->>'serial'`, terminal),
      ))

    if (vistos.length > 0 && !vistos.some(v => v.grupoId === grupo.id)) {
      const onde = vistos.map(v => v.grupoNome).join(', ')
      throw new Error(
        `Este arquivo é da maquininha ${terminal}, que pertence ao grupo ${onde}. ` +
        `Você está em ${grupo.nome}. Troque de grupo antes de importar — nada foi gravado.`,
      )
    }
  }

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
      rawData:        { bandeira: r.bandeira, portador: r.portador, serial: r.terminal ?? null },
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
        // Fora do período de conciliação não é candidato — ver INICIO_CONCILIACAO.
        gte(conciliacoesCartao.dataTransacao, INICIO_CONCILIACAO),
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

// O mesmo status de conciliação aparece em várias telas; todas revalidam juntas
// para nunca divergirem (uma dizendo "pendente" e a outra "conciliada").
function revalidatePathsConciliacao() {
  revalidatePath('/vendas')
  revalidatePath('/pecas')
  revalidatePath('/ordens-servico')
  revalidatePath('/dashboard')
  revalidatePath('/conciliacao')
  revalidatePath('/pix-mcp')
}

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
  if (GESTORES_CONC.includes(usuario.papel) ? !(await podeAbrirRegistroDaLoja(usuario, lojaId)) : lojaId !== usuario.lojaId) throw new Error('Sem permissão')

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
  if (GESTORES_CONC.includes(usuario.papel) ? !(await podeAbrirRegistroDaLoja(usuario, lojaId)) : lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  // Fonte única desde 15/09/2026: o PIX do ValidaPix saiu junto com a
  // integração. Venda de antes de julho/2026, cujo pagamento só existia lá,
  // aparece aqui sem PIX — o dado está em
  // backups/pix_recebimentos_validapix_20260915.json.
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
      gte(conciliacoesCartao.dataTransacao, INICIO_CONCILIACAO),
      eq(conciliacoesCartao.conciliado, false),
      filtro,
    ))
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(15)
}

// ─── PIX por alvo (venda de moto, peça ou OS) ────────────────────────────────
// O cartão sempre teve mão dupla: da venda dá pra achar a transação, e da transação
// dá pra achar a venda. O PIX só tinha um lado — quem quisesse conciliar um PIX
// precisava sair da venda, ir em /pix-mcp e digitar o número de cabeça. Estas duas
// funções fecham a outra mão, com as mesmas regras de grupo e papel do cartão.

/** Recebimento PIX ainda não vinculado a nada, do grupo ativo. */
export type PixLivre = {
  id: string
  data: Date
  valor: string
  pagadorNome: string | null
  descricao: string | null
}

/**
 * PIX livres pra conciliar com o alvo. Sem `query`, procura por valor aproximado
 * (o mesmo ±5 do cartão); com `query`, casa por pagador, descrição, data
 * (AAAA-MM-DD) ou valor.
 */
export async function buscarPixLivres(valor: number, query?: string): Promise<PixLivre[]> {
  const usuario = await getUsuarioLogado()
  if (!GESTORES_CONC.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const q = (query ?? '').trim()
  let filtro
  if (!q) {
    filtro = sql`ABS(${pixRecebimentosMcp.valor}::numeric - ${valor}) <= 5`
  } else {
    const valorBusca = parseFloat(q.replace(/\./g, '').replace(',', '.'))
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
      filtro = sql`${pixRecebimentosMcp.data}::date = ${q}::date`
    } else if (Number.isFinite(valorBusca) && valorBusca > 0) {
      filtro = sql`ABS(${pixRecebimentosMcp.valor}::numeric - ${valorBusca}) <= 5`
    } else {
      filtro = or(
        ilike(pixRecebimentosMcp.pagadorNome, `%${q}%`),
        ilike(pixRecebimentosMcp.descricao, `%${q}%`),
      )
    }
  }

  const linhas = await db
    .select({
      id:          pixRecebimentosMcp.id,
      data:        pixRecebimentosMcp.data,
      valor:       pixRecebimentosMcp.valor,
      pagadorNome: pixRecebimentosMcp.pagadorNome,
      descricao:   pixRecebimentosMcp.descricao,
    })
    .from(pixRecebimentosMcp)
    .where(and(
      eq(pixRecebimentosMcp.grupoId, grupo.id),
      gte(pixRecebimentosMcp.data, INICIO_CONCILIACAO_EM),
      isNull(pixRecebimentosMcp.tipoCorrespondencia),
      filtro,
    ))
    .orderBy(desc(pixRecebimentosMcp.data))
    .limit(30)

  // Liquidação da maquininha e transferência entre contas do grupo não é dinheiro de
  // cliente — filtrar em JS porque a regra é de nome, não de coluna. Ver pix-internos.ts.
  return linhas.filter(l => !ehTransferenciaInterna(l.pagadorNome)).slice(0, 15)
}

export async function vincularPixAlvoAction(pixId: string, alvo: AlvoConciliacao) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES_CONC.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const lojaId = await lojaIdDoAlvo(alvo)
  if (!lojaId) throw new Error('Venda não encontrada')
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(lojaId)) throw new Error('Venda não pertence ao grupo ativo')

  const [pix] = await db
    .select({ pagadorNome: pixRecebimentosMcp.pagadorNome })
    .from(pixRecebimentosMcp)
    .where(and(eq(pixRecebimentosMcp.id, pixId), eq(pixRecebimentosMcp.grupoId, grupo.id)))
    .limit(1)
  if (!pix) throw new Error('PIX não encontrado no grupo ativo')
  if (ehTransferenciaInterna(pix.pagadorNome)) {
    throw new Error('Essa transferência é interna (maquininha/conta do próprio grupo) e não pode ser conciliada com uma venda')
  }

  // `tipoCorrespondencia` usa 'venda' pra moto — é o enum que /pix-mcp já grava.
  const tipo = alvo.tipo === 'moto' ? 'venda' : alvo.tipo

  await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: tipo,
      vendaId:     alvo.tipo === 'moto' ? alvo.id : null,
      pecaVendaId: alvo.tipo === 'peca' ? alvo.id : null,
      osId:        alvo.tipo === 'os'   ? alvo.id : null,
      pedidoId:    null,
      lancadoPorId: usuario.id,
      lancadoEm:   new Date(),
    })
    .where(and(eq(pixRecebimentosMcp.id, pixId), eq(pixRecebimentosMcp.grupoId, grupo.id)))

  revalidatePathsConciliacao()
}

export async function desvincularPixAlvoAction(pixId: string) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES_CONC.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)

  const atualizadas = await db.update(pixRecebimentosMcp)
    .set({
      tipoCorrespondencia: null,
      vendaId: null, pecaVendaId: null, osId: null, pedidoId: null,
      lancadoPorId: null, lancadoEm: null,
    })
    .where(and(eq(pixRecebimentosMcp.id, pixId), eq(pixRecebimentosMcp.grupoId, grupo.id)))
    .returning({ id: pixRecebimentosMcp.id })

  if (atualizadas.length === 0) throw new Error('PIX não encontrado no grupo ativo')

  revalidatePathsConciliacao()
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

  revalidatePathsConciliacao()
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
