import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { dadosExportContabil, competenciaTexto } from '@/lib/queries/export-contabil'
import { competenciasEntre, MAX_MESES_EXPORT } from '@/lib/export-contabil'

// Mesmo gate da tela do DRE e da rota de impressão. Demonstrativo com despesa
// linha a linha não é assunto de balcão.
const PAPEIS = ['admin_geral', 'admin_socio']

// Doze meses de venda, OS, peça e extrato numa pasta só passam do default.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Largura das colunas pela largura do cabeçalho — planilha que abre legível. */
function larguras(cabecalho: string[], minimo = 12) {
  return cabecalho.map(c => ({ wch: Math.max(minimo, c.length + 2) }))
}

function aba(dados: Record<string, unknown>[], cabecalho: string[]) {
  const ws = XLSX.utils.json_to_sheet(dados, { header: cabecalho })
  ws['!cols'] = larguras(cabecalho)
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: cabecalho.length - 1, r: Math.max(dados.length, 1) },
  }) }
  return ws
}

export async function GET(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (!PAPEIS.includes(usuario.papel)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const de = req.nextUrl.searchParams.get('de') ?? ''
  const ate = req.nextUrl.searchParams.get('ate') ?? ''
  const competencias = competenciasEntre(de, ate)
  if (!competencias) {
    return NextResponse.json(
      { error: `Período inválido. Use de=AAAA-MM&ate=AAAA-MM, no máximo ${MAX_MESES_EXPORT} meses.` },
      { status: 400 },
    )
  }

  const [grupo, lojaIds] = await Promise.all([
    getGrupoAtivo(usuario),
    listarLojaIdsDoGrupoAtivo(usuario),
  ])

  const dados = await dadosExportContabil({ grupo, lojaIds, competencias })

  const wb = XLSX.utils.book_new()

  // ── Resumo: o DRE de cada mês, na ordem em que a tela mostra ───────────────
  const resumo: (string | number)[][] = [
    [`Demonstrativo — ${dados.grupo}`],
    [`Competências: ${competencias.map(competenciaTexto).join(', ')}`],
    [`Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`],
    [],
  ]
  for (const mes of dados.resumo) {
    resumo.push([mes.competencia], ['Linha', 'Valor (R$)', '% da receita líquida'])
    for (const l of mes.linhas) {
      resumo.push([`${l.nivel === 1 ? '    ' : ''}${l.rotulo}`, l.valor, l.percentual / 100])
    }
    resumo.push([])
  }
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

  // ── Despesas ──────────────────────────────────────────────────────────────
  const cabDespesas = ['competencia', 'data', 'origem', 'banco', 'favorecido', 'descricao',
    'categoria', 'loja', 'valor', 'entraNoResultado', 'motivo']
  XLSX.utils.book_append_sheet(wb, aba(dados.despesas, cabDespesas), 'Despesas')

  // ── Receitas ──────────────────────────────────────────────────────────────
  const cabVendas = ['competencia', 'data', 'numero', 'notaFiscal', 'loja', 'vendedor', 'cliente',
    'modelo', 'chassi', 'valorBruto', 'taxas', 'valorLiquido', 'formaPagamento', 'origem']
  XLSX.utils.book_append_sheet(wb, aba(dados.vendas, cabVendas), 'Vendas de motos')

  const cabServicos = ['competencia', 'data', 'numero', 'loja', 'cliente', 'maoDeObra', 'pecas',
    'total', 'formaPagamento']
  XLSX.utils.book_append_sheet(wb, aba(dados.servicos, cabServicos), 'Serviços (OS)')

  const cabPecas = ['competencia', 'data', 'numero', 'loja', 'cliente', 'total', 'formaPagamento']
  XLSX.utils.book_append_sheet(wb, aba(dados.pecas, cabPecas), 'Peças (balcão)')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const nome = `contabilidade-${dados.grupo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${de}-a-${ate}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  })
}
