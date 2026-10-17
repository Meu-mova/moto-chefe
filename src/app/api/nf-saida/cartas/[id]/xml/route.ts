import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { notasFiscaisSaida, notasFiscaisSaidaCartas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { configNotaGateway, xmlCartaCorrecao } from '@/lib/notagateway/client'
import { divergenciaDeAmbiente } from '@/lib/notagateway/ambiente'
import { podeOperarNfSaida } from '@/app/(dashboard)/vendas/papeis-nf-saida'

/**
 * XML da carta de correção (#187). A Nota Gateway só entrega o XML com a chave
 * da API, então ele passa por aqui. Carta de outro grupo responde 404, como a
 * rota do XML do radar: não confirma que o id existe.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (!podeOperarNfSaida(usuario.papel)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const [linha] = await db.select({ carta: notasFiscaisSaidaCartas, numeroNf: notasFiscaisSaida.numero })
    .from(notasFiscaisSaidaCartas)
    .innerJoin(notasFiscaisSaida, eq(notasFiscaisSaida.id, notasFiscaisSaidaCartas.notaId))
    .where(eq(notasFiscaisSaidaCartas.id, id)).limit(1)
  if (!linha || linha.carta.situacao !== 'autorizada' || !(await podeUsuarioVerGrupo(usuario, linha.carta.grupoId))) {
    return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  }
  const { carta, numeroNf } = linha

  const cfg = await configNotaGateway(carta.grupoId)
  if (!cfg) return NextResponse.json({ error: 'Emissão pelo MOVA não configurada para este grupo' }, { status: 409 })
  const divergencia = divergenciaDeAmbiente(carta.ambiente, cfg.ambiente, 'baixar o XML')
  if (divergencia) return NextResponse.json({ error: divergencia }, { status: 409 })

  try {
    const xml = await xmlCartaCorrecao(cfg, carta.idExterno)
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="carta-correcao-nf${numeroNf ?? ''}-${carta.numero}.xml"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
