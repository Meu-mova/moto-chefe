// src/app/api/nfe/[chave]/danfe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarXmlDaNota } from '@/lib/queries/nfe-recebidas'
import { gerarPDF } from 'nfe-danfe-pdf'

/**
 * Gera o DANFE (PDF) a partir do XML guardado da nota, e devolve como anexo.
 * Mesmo gate e mesma checagem de grupo ativo da rota de XML — ver o
 * comentário lá. Só muda o formato de saída.
 *
 * `gerarPDF` devolve um documento PDFKit, não um Buffer, e já chama
 * `doc.end()` por dentro — chamar de novo dá "stream.push() after EOF".
 * Por isso a coleta é ouvindo os eventos do stream, sem chamar `.end()`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (!usuarioPodeAcessar(usuario, '/radar-fiscal')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { chave } = await params
  const grupo = await getGrupoAtivo(usuario)
  const xml = await buscarXmlDaNota(grupo.id, chave)
  if (xml == null) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

  // O XML já passou pelo parser da SEFAZ antes de ser gravado, então isto é
  // raro — mas layout mais antigo ou algum campo fora do esperado (ex.: nota
  // sem pag/detPag) faz a lib acessar propriedade sem guarda e estourar. Sem
  // este try/catch, a exceção subia crua: 500 mudo, sem dizer o que houve. O
  // XML guardado continua servível pela outra rota mesmo quando o DANFE falha
  // — por isso o erro tratado sugere baixá-lo.
  let buffer: Buffer
  try {
    const doc = await gerarPDF(xml)
    buffer = await new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = []
      doc.on('data', (p: Buffer) => partes.push(p))
      doc.on('end', () => resolve(Buffer.concat(partes)))
      doc.on('error', reject)
    })
  } catch (e) {
    // Só o motivo no log, nunca o XML inteiro (pode conter dado sensível de
    // terceiro — CNPJ, endereço, valor — de uma nota que não é nem do grupo
    // logado necessariamente relevante pra quem lê o log).
    console.error(`[danfe] falha ao gerar PDF da nota ${chave}:`, e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: 'Não foi possível gerar o DANFE desta nota (XML em formato inesperado). Baixe o XML dela em vez disso.' },
      { status: 500 },
    )
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${chave}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
