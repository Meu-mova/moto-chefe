type ContaBancaria = {
  id: string
  banco: string
  tipo: 'corrente'
  numero: string
  saldo: string
}

type ResultadoSaldos =
  | { ok: true; contas: ContaBancaria[] }
  | { ok: false; erro: string }

type RespostaMcp = {
  json: { result?: unknown; error?: { message?: string } }
  sessionId: string | null
}

function parseSse(texto: string): RespostaMcp['json'] {
  const linha = texto.split('\n').find(l => l.startsWith('data:'))
  if (!linha) throw new Error('Resposta do mcp.ai sem payload SSE')
  return JSON.parse(linha.slice('data:'.length).trim())
}

async function chamarMcp(sessionId: string | null, body: Record<string, unknown>): Promise<RespostaMcp> {
  const url = process.env.MCPAI_ENDPOINT_URL
  if (!url) throw new Error('MCPAI_ENDPOINT_URL não configurada')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const texto = await res.text()
  const json = parseSse(texto)
  return { json, sessionId: res.headers.get('mcp-session-id') }
}

async function buscarSaldosAoVivo(sessionId: string | null, ids: string[]): Promise<Map<string, string>> {
  const saldos = new Map<string, string>()
  if (!sessionId || ids.length === 0) return saldos

  try {
    const chamada = await chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'openfinance_get_account_balance',
        arguments: { account_ids: ids },
      },
    })
    if (chamada.json.error) return saldos

    const result = chamada.json.result as { content?: { text?: string }[] } | undefined
    const conteudo = result?.content?.[0]?.text
    if (!conteudo) return saldos

    const payload = JSON.parse(conteudo) as { results?: Array<{
      account_id: string
      balance: { balance: string }
    }> }
    for (const r of payload.results ?? []) {
      saldos.set(r.account_id, r.balance.balance)
    }
  } catch {
    // saldo ao vivo é um refinamento; se falhar, usamos o saldo do list_accounts
  }

  return saldos
}


export async function buscarSaldosBancarios(): Promise<ResultadoSaldos> {
  try {
    const init = await chamarMcp(null, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'moto-chefe', version: '1.0' },
      },
    })
    if (init.json.error) {
      return { ok: false, erro: init.json.error.message ?? 'Erro ao iniciar sessão com mcp.ai' }
    }
    if (!init.sessionId) {
      return { ok: false, erro: 'mcp.ai não retornou identificador de sessão' }
    }

    const chamada = await chamarMcp(init.sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'openfinance_list_accounts',
        arguments: { type: 'BANK' },
      },
    })
    if (chamada.json.error) {
      return { ok: false, erro: chamada.json.error.message ?? 'Erro ao buscar contas no mcp.ai' }
    }

    const result = chamada.json.result as { content?: { text?: string }[] } | undefined
    const conteudo = result?.content?.[0]?.text
    if (!conteudo) return { ok: false, erro: 'Resposta inesperada do mcp.ai' }

    const payload = JSON.parse(conteudo) as { results?: Array<{
      id: string
      bank: string
      subtype: string
      number: string
      balance: string
    }> }
    const resultados = (payload.results ?? []).filter(r => r.subtype !== 'SAVINGS_ACCOUNT')

    const saldosAoVivo = await buscarSaldosAoVivo(init.sessionId, resultados.map(r => r.id))

    const contas: ContaBancaria[] = resultados.map(r => ({
      id: r.id,
      banco: r.bank,
      tipo: 'corrente',
      numero: r.number,
      saldo: saldosAoVivo.get(r.id) ?? r.balance,
    }))

    return { ok: true, contas }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
}
