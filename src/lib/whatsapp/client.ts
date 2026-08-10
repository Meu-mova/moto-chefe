type RespostaMcp = {
  json: { result?: unknown; error?: { message?: string } }
  sessionId: string | null
}

function parseSse(texto: string): RespostaMcp['json'] {
  const linha = texto.split('\n').find(l => l.startsWith('data:'))
  if (!linha) throw new Error('Resposta do mcp.ai sem payload SSE')
  return JSON.parse(linha.slice('data:'.length).trim())
}

async function chamarMcp(url: string, sessionId: string | null, body: Record<string, unknown>): Promise<RespostaMcp> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const texto = await res.text()
  return { json: parseSse(texto), sessionId: res.headers.get('mcp-session-id') }
}

/** Corpo JSON-RPC da chamada de envio — puro, é o que o teste cobre. */
export function montarChamadaEnvio(numero: string, texto: string): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'whatsapp_send_text', arguments: { to: numero, text: texto } },
  }
}

export type ResultadoEnvioWhatsapp = 'enviado' | 'sem_numero' | 'erro'

/**
 * Dispara um alerta de texto no WhatsApp via mcp.ai. Nunca lança — aviso é
 * efeito colateral e não pode derrubar venda nem o cron.
 */
export async function enviarAlertaWhatsapp(texto: string): Promise<ResultadoEnvioWhatsapp> {
  const url = process.env.MCPAI_WHATSAPP_URL
  const numero = process.env.WHATSAPP_ALERTA_NUMERO?.trim()
  if (!url) {
    console.error('MCPAI_WHATSAPP_URL não configurada')
    return 'erro'
  }
  if (!numero) return 'sem_numero'

  try {
    const init = await chamarMcp(url, null, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'moto-chefe', version: '1.0' },
      },
    })
    if (init.json.error || !init.sessionId) {
      console.error('whatsapp initialize falhou:', init.json.error?.message ?? 'sem sessão')
      return 'erro'
    }

    const envio = await chamarMcp(url, init.sessionId, montarChamadaEnvio(numero, texto))
    if (envio.json.error) {
      console.error('whatsapp_send_text falhou:', envio.json.error.message)
      return 'erro'
    }
    return 'enviado'
  } catch (e) {
    console.error('envio de whatsapp falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
