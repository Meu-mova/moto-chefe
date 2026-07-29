import { NextRequest, NextResponse } from 'next/server'
import { acharPergunta, porId } from '@/lib/telegram/perguntas-prontas'
import { consultaSomenteLeitura } from '@/lib/jarvis/consulta-readonly'
import { responderComClaude } from '@/lib/telegram/cerebro'
import {
  enviarMensagem,
  responderCallback,
  enviarAcaoDigitando,
  tecladoMenu,
} from '@/lib/telegram/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = process.env.TELEGRAM_ALLOWED_CHAT_ID ?? ''

function webhookAutorizado(req: NextRequest): boolean {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET
  return !!segredo && req.headers.get('x-telegram-bot-api-secret-token') === segredo
}

async function responder(texto: string): Promise<string> {
  const p = acharPergunta(texto)
  if (p) return p.formatar((await consultaSomenteLeitura(p.sql)).rows as any[])
  return await responderComClaude(texto)
}

export async function POST(req: NextRequest) {
  if (!webhookAutorizado(req)) return NextResponse.json({ ok: false }, { status: 401 })

  let update: any
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update?.message
  const cq = update?.callback_query
  try {
    if (msg) {
      const chatId = msg.chat?.id
      const textoBruto = String(msg.text ?? '').trim()

      // /chatid responde ANTES da whitelist, senão um grupo novo nunca consegue
      // se identificar (o handler descarta chat desconhecido em silêncio) e não
      // há como cadastrar o destino do aviso no Admin. Só devolve ao próprio
      // chat o id dele mesmo — não expõe dado do sistema.
      if (textoBruto === '/chatid') {
        await enviarMensagem(
          chatId,
          `Chat ID: ${chatId}\n\nCole esse número em Admin → Grupos, no campo "Chat do Telegram" da bandeira que deve receber os avisos.`,
        )
        return NextResponse.json({ ok: true })
      }

      if (String(chatId) !== ALLOWED) return NextResponse.json({ ok: true }) // ignora estranhos
      const texto = textoBruto
      if (!texto) return NextResponse.json({ ok: true })
      if (texto === '/start' || texto === '/menu') {
        await enviarMensagem(
          chatId,
          texto === '/start'
            ? 'Sou o consultor do MOVA (só leitura). Toque /menu ou pergunte à vontade.'
            : 'Escolha uma consulta:',
          tecladoMenu(),
        )
        return NextResponse.json({ ok: true })
      }
      await enviarAcaoDigitando(chatId)
      await enviarMensagem(chatId, await responder(texto))
    } else if (cq) {
      const fromId = cq.from?.id
      if (String(fromId) !== ALLOWED) {
        await responderCallback(cq.id, 'Nao autorizado')
        return NextResponse.json({ ok: true })
      }
      await responderCallback(cq.id)
      const p = porId(String(cq.data ?? ''))
      if (p) {
        const destino = cq.message?.chat?.id ?? fromId
        await enviarMensagem(destino, p.formatar((await consultaSomenteLeitura(p.sql)).rows as any[]))
      }
    }
  } catch (e) {
    console.error('telegram/webhook erro:', e)
    const destino = msg?.chat?.id ?? cq?.from?.id
    if (destino && String(destino) === ALLOWED) {
      await enviarMensagem(destino, 'Deu um erro ao consultar agora. Tenta de novo em instantes?')
    }
  }
  return NextResponse.json({ ok: true })
}
