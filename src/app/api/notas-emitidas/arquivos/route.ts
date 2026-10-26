import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { notasParaBaixar } from '@/lib/queries/notas-emitidas'
import { nomeDoArquivo, periodoEmissao, type Situacao, type TipoArquivo } from '@/lib/notas-emitidas'
import { zipDasNotas, type Baixar } from '@/lib/notas-emitidas-arquivos'

// Route Handler e não Server Action: um lote grande leva minutos e Server Action trava as outras (hotfix v1.2.2).
export const maxDuration = 300
// Folga para o último lote de downloads (até 30 s) e o fim do zip.
const PRAZO_DOWNLOADS_MS = 240_000
export const dynamic = 'force-dynamic'

const SITUACOES: Situacao[] = ['todas', 'autorizada', 'cancelada', 'recusada', 'em_andamento']

const baixar: Baixar = async url => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
}

/**
 * XML e PDF das notas da tela (#402): `ids` são as marcadas; sem nenhuma, vale o filtro (situação e período).
 * Um id e um tipo devolvem o arquivo direto; o resto vem num zip.
 */
export async function GET(req: NextRequest) {
  return responder(req, req.nextUrl.searchParams)
}

/** Seleção de várias páginas: os ids vão no corpo, que não tem o limite de tamanho da URL. */
export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const p = new URLSearchParams()
  for (const [chave, valor] of Object.entries(corpo)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) if (typeof v === 'string') p.append(chave, v)
  }
  return responder(req, p)
}

async function responder(req: NextRequest, p: URLSearchParams) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    // JSON e não redirect: o fetch da tela seguiria o redirect e baixaria a página de login como zip.
    return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  }
  if (!usuarioPodeAcessar(usuario, '/notas-emitidas')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const tipos: TipoArquivo[] = p.get('tipo') === 'xml' ? ['xml'] : p.get('tipo') === 'pdf' ? ['pdf'] : ['xml', 'pdf']
  const situacao = SITUACOES.find(s => s === p.get('situacao')) ?? 'todas'
  const ids = p.getAll('id')
  const grupo = await grupoAtivoDaRequisicao(usuario)
  const periodo = periodoEmissao({ de: p.get('de') ?? undefined, ate: p.get('ate') ?? undefined })

  const notas = await notasParaBaixar({
    grupoId: grupo.id,
    contaId: usuario.papel === 'admin_geral' ? null : grupo.contaId,
    ambiente: p.get('ambiente') === 'Homologacao' ? 'Homologacao' : 'Producao',
    ...periodo,
  }, { situacao, ids })
  if (notas.length === 0) return NextResponse.json({ error: 'Nenhuma nota com documento neste filtro.' }, { status: 404 })

  if (ids.length === 1 && notas.length === 1 && tipos.length === 1) {
    const [n] = notas
    const url = tipos[0] === 'xml' ? n.linkXml : n.linkDanfe
    const conteudo = url ? await baixar(url).catch(() => null) : null
    if (!conteudo) return NextResponse.json({ error: 'Arquivo indisponível na Nota Gateway. Tente de novo mais tarde.' }, { status: 502 })
    return new NextResponse(conteudo as BodyInit, { headers: {
      'Content-Type': tipos[0] === 'xml' ? 'application/xml' : 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeDoArquivo(n, tipos[0])}"`,
    } })
  }

  const inicio = Date.now()
  return new NextResponse(zipDasNotas(notas, tipos, baixar, () => Date.now() - inicio > PRAZO_DOWNLOADS_MS), { headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="notas-${grupo.nome.replace(/[^\w-]+/g, '-')}-${periodo.de}-a-${periodo.ate}.zip"`,
  } })
}
