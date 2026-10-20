import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { mensalidades, mensalidadeWebhookEventos } from '@/lib/db/schema'
import { assinaturaValida, ambienteConfere, falhaDefinitiva } from '@/lib/mercadopago/webhook'
import { aplicarBaixa } from '@/lib/mensalidade/baixa'
import { consultarPagamento, ErroMercadoPago } from '@/lib/mercadopago/cliente'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Corpo = { id?: string | number; type?: string; action?: string; live_mode?: boolean; data?: { id?: string | number } }

// O Mercado Pago reenvia se não receber 200 em 22 s. Na Vercel a função congela ao
// responder, então o trabalho (uma consulta e uma escrita) acontece antes do retorno.
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const corpo = (await req.json().catch(() => ({}))) as Corpo
  const dataId = url.searchParams.get('data.id') ?? (corpo.data?.id != null ? String(corpo.data.id) : null)
  const tipo = url.searchParams.get('type') ?? corpo.type ?? null

  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) console.error('[webhook mercadopago] MP_WEBHOOK_SECRET não configurado: toda notificação será recusada')
  const ok = assinaturaValida({
    secret: secret ?? '',
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId,
  })
  if (!ok) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })

  const notificacaoId = String(corpo.id ?? req.headers.get('x-request-id') ?? `${tipo}:${dataId}`)
  const [evento] = await db.insert(mensalidadeWebhookEventos).values({
    mpNotificationId: notificacaoId, tipo, action: corpo.action ?? null, dataId, liveMode: corpo.live_mode ?? null,
  }).onConflictDoNothing().returning({ id: mensalidadeWebhookEventos.id })
  // Já recebida: o reenvio não refaz nada.
  if (!evento) return NextResponse.json({ ok: true, repetida: true })

  const fechar = (erro: string | null) => db.update(mensalidadeWebhookEventos)
    .set({ processadoEm: new Date(), erro }).where(eq(mensalidadeWebhookEventos.id, evento.id))

  if (tipo !== 'payment' || !dataId) {
    await fechar(null)
    return NextResponse.json({ ok: true, ignorada: tipo })
  }
  if (!ambienteConfere(corpo.live_mode, process.env.VERCEL_ENV === 'production')) {
    await fechar('live_mode diferente do ambiente')
    return NextResponse.json({ ok: true, ignorada: 'ambiente' })
  }

  try {
    const pg = await consultarPagamento(dataId)
    const ref = pg.external_reference
    // Referência que não é uuid não acha mensalidade; falha do banco precisa cair no 500.
    const [m] = ref && UUID.test(ref)
      ? await db.select().from(mensalidades).where(eq(mensalidades.id, ref)).limit(1)
      : []
    // O ambiente do pagamento consultado é a fonte confiável; o do corpo, não.
    const r = await aplicarBaixa(pg, m ?? null, process.env.VERCEL_ENV === 'production')
    await fechar(r.registro)
    return NextResponse.json({ ok: true, acao: r.acao })
  } catch (e) {
    // Pagamento inexistente ou de outra conta não melhora com reenvio: fica registrado.
    if (e instanceof ErroMercadoPago && falhaDefinitiva(e.status)) {
      await fechar(e.message)
      return NextResponse.json({ ok: true, acao: 'erro' })
    }
    // Falha passageira (API deles fora): apaga o registro para o reenvio do Mercado
    // Pago, que o 500 provoca, ser processado de novo em vez de cair como repetido.
    console.error('[webhook mercadopago] falha ao processar pagamento:', e instanceof Error ? e.message : 'erro desconhecido')
    await db.delete(mensalidadeWebhookEventos).where(eq(mensalidadeWebhookEventos.id, evento.id))
    return NextResponse.json({ error: 'falha ao consultar o pagamento' }, { status: 500 })
  }
}
