import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contratosAdesao, contratosAdesaoEventos, contratosAdesaoCodigos } from '@/lib/db/schema'
import { TEXTOS_ADESAO } from '@/lib/assinatura/textos-emissor'
import { AssinarClient } from '../../[token]/assinar-client'
import { solicitarCodigoAdesaoAction, conferirCodigoAdesaoAction, selarAssinaturaAdesaoAction } from './actions'
import { ipDoPedido } from '@/lib/ip-do-pedido'

// Contrato de licença de uso do MOVA (#165): mesma tela da venda, outras tabelas.
export default async function AssinarAdesaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [doc] = await db.select().from(contratosAdesao)
    .where(eq(contratosAdesao.token, token)).limit(1)

  // 404 genérico: não revela se o token existiu algum dia.
  if (!doc) notFound()

  const h = await headers()
  const ip = ipDoPedido(h)
  const userAgent = h.get('user-agent') ?? ''

  if (doc.status === 'pendente') {
    await db.update(contratosAdesao).set({ status: 'visualizado' })
      .where(eq(contratosAdesao.id, doc.id))
  }
  await db.insert(contratosAdesaoEventos).values({
    contratoId: doc.id, tipo: 'link_aberto', ip, userAgent,
  })

  const expirado = new Date() > doc.expiraEm && doc.status !== 'assinado'

  // Retoma o passo de quem saiu para o e-mail buscar o código e voltou.
  const [codigo] = await db.select({
    usadoEm: contratosAdesaoCodigos.usadoEm,
    expiraEm: contratosAdesaoCodigos.expiraEm,
  })
    .from(contratosAdesaoCodigos)
    .where(eq(contratosAdesaoCodigos.contratoId, doc.id))
    .orderBy(desc(contratosAdesaoCodigos.criadoEm))
    .limit(1)

  const passoInicial = codigo?.usadoEm
    ? 'selfie'
    : codigo && codigo.expiraEm > new Date()
      ? 'codigo'
      : 'leitura'

  return (
    <AssinarClient
      acoes={{ solicitar: solicitarCodigoAdesaoAction, conferir: conferirCodigoAdesaoAction, selar: selarAssinaturaAdesaoAction }}
      textos={TEXTOS_ADESAO}
      passoInicial={passoInicial}
      token={token}
      html={doc.htmlSnapshot}
      tipo="contrato_adesao"
      status={doc.status}
      cancelado={doc.status === 'cancelado'}
      expirado={expirado}
      docHash={doc.docHash}
      assinadoEm={doc.assinadoEm?.toISOString() ?? null}
      ipAssinatura={doc.ipAssinatura}
    />
  )
}
