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


type TransacaoPix = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  pagadorNome: string | null
  descricao: string | null
}

type ResultadoPix =
  | { ok: true; transacoes: TransacaoPix[] }
  | { ok: false; erro: string }

export async function buscarPixRecebidos(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoPix> {
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

    const contasChamada = await chamarMcp(init.sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'openfinance_list_accounts',
        arguments: { type: 'BANK' },
      },
    })
    if (contasChamada.json.error) {
      return { ok: false, erro: contasChamada.json.error.message ?? 'Erro ao buscar contas no mcp.ai' }
    }
    const contasResult = contasChamada.json.result as { content?: { text?: string }[] } | undefined
    const contasConteudo = contasResult?.content?.[0]?.text
    if (!contasConteudo) return { ok: false, erro: 'Resposta inesperada do mcp.ai ao listar contas' }

    const contasPayload = JSON.parse(contasConteudo) as {
      results?: Array<{ id: string; bank: string; subtype: string; taxNumber: string }>
    }
    // Cada CNPJ conectado aparece como um "item" próprio no mcp.ai — filtramos
    // pelo CNPJ do grupo ativo pra não misturar contas de grupos diferentes
    // (ex: Sicredi do Sul de Minas vs Sicredi da BH, ambas com o mesmo nome de banco).
    // Sicredi do Sul de Minas não é usada pra receber PIX de venda — só a Sicoob.
    const BANCOS_EXCLUIDOS_POR_CNPJ: Record<string, string[]> = {
      '57.113.017/0001-72': ['Sicredi Empresas'],
    }
    const bancosExcluidos = BANCOS_EXCLUIDOS_POR_CNPJ[cnpjGrupo] ?? []
    const contas = (contasPayload.results ?? []).filter(
      c => c.subtype !== 'SAVINGS_ACCOUNT' && c.taxNumber === cnpjGrupo && !bancosExcluidos.includes(c.bank),
    )

    const inicioMs = dataInicio.getTime()
    const fimMs = dataFim.getTime()
    const transacoes: TransacaoPix[] = []

    for (const conta of contas) {
      // O mcp.ai não atualiza a conta em tempo real sozinho — sem forçar o
      // sync, transações PIX recebidas nas últimas horas não aparecem ainda.
      await chamarMcp(init.sessionId, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'openfinance_force_sync',
          arguments: { account_id: conta.id },
        },
      }).catch(() => {})

      const txChamada = await chamarMcp(init.sessionId, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'openfinance_list_transactions',
          arguments: { account_id: conta.id },
        },
      })
      if (txChamada.json.error) continue

      const txResult = txChamada.json.result as { content?: { text?: string }[] } | undefined
      const txConteudo = txResult?.content?.[0]?.text
      if (!txConteudo) continue

      const txPayload = JSON.parse(txConteudo) as {
        results?: Array<{
          id: string
          date: string
          amount: string
          type: string
          operationType: string
          description: string
          paymentData?: { payer?: string }
        }>
      }

      for (const tx of txPayload.results ?? []) {
        if (tx.type !== 'CREDIT' || tx.operationType !== 'PIX') continue
        const dataMs = new Date(tx.date).getTime()
        if (dataMs < inicioMs || dataMs > fimMs) continue

        transacoes.push({
          contaId: conta.id,
          banco: conta.bank,
          transacaoId: tx.id,
          data: tx.date,
          valor: tx.amount,
          pagadorNome: tx.paymentData?.payer ?? null,
          descricao: tx.description ?? null,
        })
      }
    }

    return { ok: true, transacoes }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
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
