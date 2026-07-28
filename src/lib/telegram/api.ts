import { CATALOGO } from './perguntas-prontas'

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function chamar(metodo: string, corpo: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API()}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch (e) {
    console.error(`telegram ${metodo} falhou:`, e)
  }
}

export async function enviarMensagem(
  chatId: string | number,
  texto: string,
  teclado?: object,
): Promise<void> {
  await chamar('sendMessage', {
    chat_id: chatId,
    text: texto,
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
