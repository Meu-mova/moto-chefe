type ContaBancaria = {
  id: string
  banco: string
  tipo: 'corrente'
  numero: string
  // null = saldo ao vivo indisponível no momento. NUNCA usamos o balance do
  // list_accounts como fallback: para o Sicoob ele oscila para um valor lixo
  // negativo (líquido de aplicação automática), então preferimos "indisponível"
  // a mostrar um número errado.
  saldo: string | null
}

type ResultadoSaldos =
  | { ok: true; contas: ContaBancaria[] }
  | { ok: false; erro: string }

/**
 * Cada CNPJ conectado é um "item" próprio no mcp.ai, e o list_accounts devolve
 * TODOS eles de uma vez — as contas da BH vêm junto com as do Sul de Minas.
 * Comparar por dígitos porque o cadastro do grupo pode vir sem pontuação
 * enquanto o mcp.ai devolve formatado.
 */
function mesmoCnpj(a: string | null | undefined, b: string | null | undefined): boolean {
  const so = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
  const x = so(a)
  return x.length > 0 && x === so(b)
}

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

async function forcarSyncContas(sessionId: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map(id =>
    chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'openfinance_force_sync', arguments: { account_id: id } },
    }).catch(() => {}),
  ))
}

// Busca o saldo ao vivo (openfinance_get_account_balance) — única fonte confiável
// do saldo. Se algum id não voltar na 1ª tentativa, força o sync dessas contas e
// tenta mais uma vez. Contas que ainda assim não vierem ficam de fora do Map
// (→ saldo "indisponível" na UI, nunca o valor lixo do list_accounts).
async function buscarSaldosAoVivo(sessionId: string | null, ids: string[]): Promise<Map<string, string>> {
  const saldos = new Map<string, string>()
  if (!sessionId || ids.length === 0) return saldos

  const chamar = async (): Promise<void> => {
    const chamada = await chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'openfinance_get_account_balance',
        arguments: { account_ids: ids },
      },
    })
    if (chamada.json.error) return

    const result = chamada.json.result as { content?: { text?: string }[] } | undefined
    const conteudo = result?.content?.[0]?.text
    if (!conteudo) return

    const payload = JSON.parse(conteudo) as { results?: Array<{
      account_id: string
      balance?: { balance?: string | null }
    }> }
    for (const r of payload.results ?? []) {
      const v = r.balance?.balance
      if (v != null && v !== '') saldos.set(r.account_id, v)
    }
  }

  try { await chamar() } catch { /* tenta o retry abaixo */ }

  const faltando = ids.filter(id => !saldos.has(id))
  if (faltando.length > 0) {
    try {
      await forcarSyncContas(sessionId, faltando)
      await chamar()
    } catch { /* mantém o que já veio; faltantes ficam indisponíveis */ }
  }

  return saldos
}


// Formato da descrição da transação muda por banco (serve tanto pra PIX
// recebido quanto pra saídas em geral):
// - Sicoob: pseudo-CSV separado por "|@", ex. "PIX RECEBIDO - OUTRA IF -
//   Recebimento Pix|@GISELLE BOTELHO VILAS BOAS|@***.206.316-**|@" — nome
//   é o segmento [1].
// - Sicredi: "RECEBIMENTO PIX <documento sem pontuação> <NOME>" — nome é
//   tudo depois do documento (que costuma vir truncado/abreviado quando
//   comparado ao paymentData, por isso só usamos como fallback).
function extrairContraparteDaDescricao(descricao: string | null | undefined): string | null {
  if (!descricao) return null

  if (descricao.includes('|@')) {
    const nome = descricao.split('|@')[1]?.trim()
    return nome || null
  }

  const match = descricao.match(/^(?:RECEBIMENTO|PAGAMENTO)\s+\S+\s+\S+\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

type TransacaoBruta = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  tipo: string
  operationType: string
  descricao: string | null
  paymentData?: { payer?: string; recipient?: string }
}

type ResultadoTransacoesBrutas =
  | { ok: true; transacoes: TransacaoBruta[] }
  | { ok: false; erro: string }

// Busca TODAS as transações (crédito e débito) das contas do grupo no
// período — usada tanto por buscarPixRecebidos (filtra crédito/PIX) quanto
// por buscarSaidasOpenFinance (filtra débito), pra não bater duas vezes na
// API do mcp.ai pra cada sincronização.
async function listarTransacoesBrutas(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoTransacoesBrutas> {
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
      c => c.subtype !== 'SAVINGS_ACCOUNT' && mesmoCnpj(c.taxNumber, cnpjGrupo) && !bancosExcluidos.includes(c.bank),
    )

    const inicioMs = dataInicio.getTime()
    const fimMs = dataFim.getTime()
    const transacoes: TransacaoBruta[] = []

    for (const conta of contas) {
      // O mcp.ai não atualiza a conta em tempo real sozinho — sem forçar o
      // sync, transações recebidas/enviadas nas últimas horas não aparecem ainda.
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
          paymentData?: { payer?: string; recipient?: string }
        }>
      }

      for (const tx of txPayload.results ?? []) {
        const dataMs = new Date(tx.date).getTime()
        if (dataMs < inicioMs || dataMs > fimMs) continue

        transacoes.push({
          contaId: conta.id,
          banco: conta.bank,
          transacaoId: tx.id,
          data: tx.date,
          valor: tx.amount,
          tipo: tx.type,
          operationType: tx.operationType,
          descricao: tx.description ?? null,
          paymentData: tx.paymentData,
        })
      }
    }

    return { ok: true, transacoes }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
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
  const bruto = await listarTransacoesBrutas(dataInicio, dataFim, cnpjGrupo)
  if (!bruto.ok) return bruto

  const transacoes = bruto.transacoes
    .filter(t => t.tipo === 'CREDIT' && t.operationType === 'PIX')
    .map(t => ({
      contaId: t.contaId,
      banco: t.banco,
      transacaoId: t.transacaoId,
      data: t.data,
      valor: t.valor,
      pagadorNome: t.paymentData?.payer?.trim() || extrairContraparteDaDescricao(t.descricao),
      descricao: t.descricao,
    }))

  return { ok: true, transacoes }
}

export type TransacaoSaida = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  favorecidoNome: string | null
  descricao: string | null
  tipoOperacao: string
}

type ResultadoSaidas =
  | { ok: true; transacoes: TransacaoSaida[] }
  | { ok: false; erro: string }

export async function buscarSaidasOpenFinance(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoSaidas> {
  const bruto = await listarTransacoesBrutas(dataInicio, dataFim, cnpjGrupo)
  if (!bruto.ok) return bruto

  const transacoes = bruto.transacoes
    .filter(t => t.tipo === 'DEBIT')
    .map(t => ({
      contaId: t.contaId,
      banco: t.banco,
      transacaoId: t.transacaoId,
      data: t.data,
      valor: t.valor,
      favorecidoNome: t.paymentData?.recipient?.trim() || t.paymentData?.payer?.trim() || extrairContraparteDaDescricao(t.descricao),
      descricao: t.descricao,
      tipoOperacao: t.operationType,
    }))

  return { ok: true, transacoes }
}

/**
 * Saldo das contas correntes do grupo.
 *
 * O filtro por CNPJ não é detalhe: sem ele a página somava a Sicredi da BH
 * (00030201-7) no total do Sul de Minas.
 */
export async function buscarSaldosBancarios(cnpjGrupo: string): Promise<ResultadoSaldos> {
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
      taxNumber: string
    }> }
    const resultados = (payload.results ?? []).filter(
      r => r.subtype !== 'SAVINGS_ACCOUNT' && mesmoCnpj(r.taxNumber, cnpjGrupo),
    )

    const saldosAoVivo = await buscarSaldosAoVivo(init.sessionId, resultados.map(r => r.id))

    const contas: ContaBancaria[] = resultados.map(r => ({
      id: r.id,
      banco: r.bank,
      tipo: 'corrente',
      numero: r.number,
      // Só o saldo ao vivo — sem fallback pro balance do list_accounts (lixo no Sicoob)
      saldo: saldosAoVivo.get(r.id) ?? null,
    }))

    return { ok: true, contas }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
}
