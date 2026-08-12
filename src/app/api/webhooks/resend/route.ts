import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assinaturaEventos } from '@/lib/db/schema'
import { verificarAssinaturaResend, parseEventoResend, eventoIndicaFalha } from '@/lib/resend-webhook'

export const dynamic = 'force-dynamic'

// Webhook do Resend: recebe os eventos de entrega. Só nos importam bounce e
// reclamação (spam) — quando o e-mail NÃO chegou. Marcamos um evento
// 'email_bounce' no documento cujo envio gerou aquele e-mail (casado pelo
// resendId gravado no envio), para o painel avisar "e-mail voltou" em vez de
// mostrar um "enviado" que na verdade não foi entregue.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    // Sem segredo configurado a rota fica desabilitada (não confia em payload não assinado).
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const assinaturaValida = verificarAssinaturaResend(
    secret,
    req.headers.get('svix-id') ?? '',
    req.headers.get('svix-timestamp') ?? '',
    rawBody,
    req.headers.get('svix-signature') ?? '',
  )
  if (!assinaturaValida) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let json: unknown
  try { json = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: true }) }

  const ev = parseEventoResend(json)
  // Responder 200 sempre que não for nosso caso — senão o Resend fica reenviando.
  if (!ev || !eventoIndicaFalha(ev.tipo) || !ev.emailId) {
    return NextResponse.json({ ok: true })
  }

  // Acha o envio que gerou esse e-mail (resendId) e, com ele, o documento.
  const [origem] = await db
    .select({ documentoId: assinaturaEventos.documentoId })
    .from(assinaturaEventos)
    .where(sql`${assinaturaEventos.detalhe}->>'resendId' = ${ev.emailId}`)
    .limit(1)
  if (!origem) return NextResponse.json({ ok: true })

  await db.insert(assinaturaEventos).values({
    documentoId: origem.documentoId,
    tipo: 'email_bounce',
    detalhe: { tipoEvento: ev.tipo, motivo: ev.motivo, to: ev.to },
  })

  return NextResponse.json({ ok: true })
}
