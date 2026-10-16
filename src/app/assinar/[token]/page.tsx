import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos, assinaturaCodigos } from '@/lib/db/schema'
import { TEXTOS_VENDA } from '@/lib/assinatura/textos-emissor'
import { AssinarClient } from './assinar-client'
import { solicitarCodigoAction, conferirCodigoAction, selarAssinaturaAction } from './actions'

export default async function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [doc] = await db.select().from(documentosAssinatura)
    .where(eq(documentosAssinatura.token, token)).limit(1)

  // 404 genérico: não revela se o token existiu algum dia.
  if (!doc) notFound()

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim()
  const userAgent = h.get('user-agent') ?? ''

  if (doc.status === 'pendente') {
    await db.update(documentosAssinatura).set({ status: 'visualizado' })
      .where(eq(documentosAssinatura.id, doc.id))
  }
  await db.insert(assinaturaEventos).values({
    documentoId: doc.id, tipo: 'link_aberto', ip, userAgent,
  })

  const expirado = new Date() > doc.expiraEm && doc.status !== 'assinado'

  // Em que passo o cliente estava. Ele TEM que sair para o e-mail buscar o
  // código, e voltar costuma recarregar a página no celular — sem isto, ele
  // recomeçaria do zero toda vez, que foi o erro relatado em 11/08.
  const [codigo] = await db.select({
    usadoEm: assinaturaCodigos.usadoEm,
    expiraEm: assinaturaCodigos.expiraEm,
  })
    .from(assinaturaCodigos)
    .where(eq(assinaturaCodigos.documentoId, doc.id))
    .orderBy(desc(assinaturaCodigos.criadoEm))
    .limit(1)

  const passoInicial = codigo?.usadoEm
    ? 'selfie'                                        // código já conferido
    : codigo && codigo.expiraEm > new Date()
      ? 'codigo'                                      // código enviado e no prazo
      : 'leitura'

  return (
    <AssinarClient
      acoes={{ solicitar: solicitarCodigoAction, conferir: conferirCodigoAction, selar: selarAssinaturaAction }}
      textos={TEXTOS_VENDA}
      passoInicial={passoInicial}
      token={token}
      html={doc.htmlSnapshot}
      tipo={doc.tipo}
      status={doc.status}
      cancelado={doc.status === 'cancelado'}
      expirado={expirado}
      docHash={doc.docHash}
      assinadoEm={doc.assinadoEm?.toISOString() ?? null}
      ipAssinatura={doc.ipAssinatura}
    />
  )
}
