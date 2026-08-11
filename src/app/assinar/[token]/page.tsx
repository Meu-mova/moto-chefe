import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentosAssinatura, assinaturaEventos } from '@/lib/db/schema'
import { AssinarClient } from './assinar-client'

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

  return (
    <AssinarClient
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
