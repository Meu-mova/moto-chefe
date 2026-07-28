import { CATALOGO } from './perguntas-prontas'

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const LIMITE_TG = 4096

async function chamar(metodo: string, corpo: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API()}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch (e) {
    console.error(`telegram ${metodo} falhou:`, e instanceof Error ? e.message : String(e))
  }
}

/** Trunca texto ao limite do Telegram (4096 chars) com reticências. */
export function truncarMensagem(texto: string): string {
  if (texto.length <= LIMITE_TG) return texto
  return texto.substring(0, LIMITE_TG - 1) + '…'
}

export async function enviarMensagem(
  chatId: string | number,
  texto: string,
  teclado?: object,
): Promise<void> {
  const textoTruncado = truncarMensagem(texto)
  await chamar('sendMessage', {
    chat_id: chatId,
    text: textoTruncado,
    ...(teclado ? { reply_markup: teclado } : {}),
  })
}

export async function responderCallback(callbackId: string, texto?: string): Promise<void> {
  await chamar('answerCallbackQuery', { callback_query_id: callbackId, ...(texto ? { text: texto } : {}) })
}

export async function enviarAcaoDigitando(chatId: string | number): Promise<void> {
  await chamar('sendChatAction', { chat_id: chatId, action: 'typing' })
}

/** Teclado inline do /menu: um botão por pergunta pronta (callback_data = id). */
export function tecladoMenu(): object {
  const linhas = CATALOGO.map((p) => [{ text: p.titulo, callback_data: p.id }])
  return { inline_keyboard: linhas }
}
