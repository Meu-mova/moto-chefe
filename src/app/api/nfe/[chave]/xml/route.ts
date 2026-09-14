// src/app/api/nfe/[chave]/xml/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarXmlDaNota } from '@/lib/queries/nfe-recebidas'

/**
 * Devolve o XML de uma NF-e capturada pelo radar fiscal, como anexo pra
 * download — mesmo gate de acesso da tela (`/radar-fiscal`) e, além disso,
 * a nota só sai se pertencer ao grupo ativo do usuário: sem essa segunda
 * checagem, quem soubesse a chave de outro CNPJ baixaria a nota dele só de
 * trocar a URL. Nota de outro grupo (ou chave inexistente) responde 404, não
 * 403 — não confirma que a chave existe em outro lugar.
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

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${chave}.xml"`,
      'Cache-Control': 'no-store',
    },
  })
}
