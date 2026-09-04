import { agruparEmFaturas, type Fatura, type FaturaBruta, type LancamentoBruto } from './cartao-fatura'

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


/// Formato da descrição da transação muda por banco E por tipo de crédito
// dentro do mesmo banco (serve tanto pra crédito quanto pra saídas em geral):
// - Sicoob, PIX de outra instituição: pseudo-CSV separado por "|@", ex. "PIX
//   RECEBIDO - OUTRA IF - Recebimento Pix|@GISELLE BOTELHO VILAS BOAS|@***.206.316-**|@"
//   — nome é o segmento [1].
// - Sicoob, PIX entre contas Sicoob: "TRANSF.RECEBIDA - PIX SICOOB - REM.:
//   <NOME>|@Transferência Pix|@<NOME>|@<DOC>|@" — o [1] aqui é o rótulo
//   "Transferência Pix", NÃO o nome. Ler o [1] às cegas gravava a palavra
//   "Transferência Pix" como pagador em 50 recebimentos.
// - Sicoob, TED recebida: "CRÉD.TED-STR - <NOME>|@<CPF>|@CODIGO TED: T…" — o
//   nome vem ANTES do primeiro "|@" e o [1] é o CPF.
// - Sicredi: "RECEBIMENTO PIX <documento sem pontuação> <NOME>" — nome é
//   tudo depois do documento (que costuma vir truncado/abreviado quando
//   comparado ao paymentData, por isso só usamos como fallback).
export function extrairContraparteDaDescricao(descricao: string | null | undefined): string | null {
  if (!descricao) return null

  const ted = descricao.match(/^CR[ÉE]D\.TED-STR\s*-\s*([^|]+)/i)
  if (ted) return ted[1].trim() || null

  if (/^TRANSF\.RECEBIDA/i.test(descricao)) {
    const segmentos = descricao.split('|@')
    // O segmento [2] é o nome completo; o "REM.:" do [0] vem cortado em ~34
    // caracteres ("CENTRO FORMACAO DE CONDUTORES AROU"). Só caímos nele quando
    // o Sicoob não manda os segmentos — e quando nem isso vem, é null: 19
    // desses recebimentos não têm remetente nenhum no Open Finance, e chutar
    // um nome errado é pior que deixar a conciliação manual.
    const doSegmento = segmentos[2]?.trim()
    if (doSegmento) return doSegmento
    const rem = segmentos[0].match(/REM\.:\s*(.+)$/i)
    return rem?.[1]?.trim() || null
  }

  if (descricao.includes('|@')) {
    const nome = descricao.split('|@')[1]?.trim()
    return nome || null
  }

  // Stone/InfinitePay: "Transferência | Pix | NOME", "Transferência | TED | NOME"
  // — tipo no meio, contraparte sempre no último segmento.
  if (descricao.includes(' | ')) {
    const ultimo = descricao.split(' | ').pop()?.trim()
    return ultimo || null
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
    // (ex: Sicredi do Sul de Minas vs Sicredi da BH, ambas com o mesmo nome de
    // banco). Quais dessas contas interessam é decisão de CADA módulo, não
    // daqui: ver bancoEntraNoPix() e bancoEntraNaDespesa(). Filtrar banco neste
    // ponto foi o que sumiu com a Sicredi do Sul de Minas das despesas.
    const contas = (contasPayload.results ?? []).filter(
      c => c.subtype !== 'SAVINGS_ACCOUNT' && mesmoCnpj(c.taxNumber, cnpjGrupo),
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

// Contas que NÃO entram na conciliação de PIX, por grupo. A Sicredi do Sul de
// Minas está aqui porque não é a conta usada pra receber pagamento de venda
// (só a Sicoob é) — decisão do Cesar, não limitação técnica. Nada a ver com a
// lista de despesa abaixo: a mesma conta pode valer pra um módulo e não pro
// outro, e foi justamente misturar as duas que escondeu a Sicredi do
// Importar do Banco por quase dois meses.
const BANCOS_FORA_DO_PIX_POR_CNPJ: Record<string, string[]> = {
  '57.113.017/0001-72': ['Sicredi Empresas'],
}

export function bancoEntraNoPix(banco: string, cnpjGrupo: string): boolean {
  return !(BANCOS_FORA_DO_PIX_POR_CNPJ[cnpjGrupo] ?? []).includes(banco)
}

/// Contas cujas saídas viram despesa no Importar do Banco, POR GRUPO. É uma lista
// de LIBERAÇÃO: conta nova — banco ou maquininha — fica de fora até ser
// adicionada aqui. E é por CNPJ porque a mesma bandeira tem papel diferente em
// cada grupo: a Stone do Sul de Minas é maquininha (o extrato dela é repasse de
// venda e varredura pra conta principal, R$ 2,1 mi de saída falsa no card),
// enquanto a Stone da BH é conta de pagar, como a Sicredi. Lista única não
// consegue representar isso — liberar a Stone pra BH traria a do Sul de Minas
// junto.
const BANCOS_DE_DESPESA_POR_CNPJ: Record<string, string[]> = {
  // Sul de Minas
  '57.113.017/0001-72': ['Sicoob Empresas', 'Sicredi Empresas'],
  // BH
  '63.009.605/0001-63': ['Sicredi Empresas', 'Stone Pagamentos Empresas'],
}

export function bancoEntraNaDespesa(banco: string, cnpjGrupo: string): boolean {
  return (BANCOS_DE_DESPESA_POR_CNPJ[cnpjGrupo] ?? []).includes(banco)
}

type TransacaoPix = {
  contaId: string
  banco: string
  transacaoId: string
  data: string
  valor: string
  pagadorNome: string | null
  descricao: string | null
  /** 'PIX' ou 'TED' — a tela mostra pra não confundir os dois na conciliação. */
  tipoOperacao: string
}

type ResultadoPix =
  | { ok: true; transacoes: TransacaoPix[] }
  | { ok: false; erro: string }

// Créditos que entram na conciliação de /pix-mcp. TED entrou em 29/08/2026 a
// pedido do Cesar: cliente que paga moto por TED caía fora da tela e sobrava
// pra conferência manual.
const OPERACOES_CONCILIAVEIS = ['PIX', 'TED']

// Transferência entre contas correntes do mesmo banco — no Sicoob vem como
// operationType OUTROS e descrição "CRED.TRANSF.CONTAS INTERCREDIS". Ficou fora
// da tela até 31/08/2026 porque não traz o nome do remetente, mas é dinheiro de
// cliente que entrou: a venda da NF 2284 recebeu R$ 4.490 assim e a linha nunca
// apareceu pra conciliar. Entra sem remetente mesmo — a conferência é pelo valor.
//
// O que continua fora, de propósito, é o resto do INTERCREDIS: "CRÉD.TRANSF.
// POUPANÇA" é resgate da aplicação da própria empresa e "DEP.DINHEIRO" é depósito
// em espécie no caixa — nenhum dos dois é pagamento a conciliar.
export function ehTransferenciaEntreContas(descricao: string | null | undefined): boolean {
  return /TRANSF\.CONTAS/i.test(descricao ?? '')
}

/** Rótulo mostrado na coluna "tipo" de /pix-mcp para esses créditos. */
const TIPO_TRANSFERENCIA_CONTAS = 'TRANSF'

export async function buscarPixRecebidos(dataInicio: Date, dataFim: Date, cnpjGrupo: string): Promise<ResultadoPix> {
  const bruto = await listarTransacoesBrutas(dataInicio, dataFim, cnpjGrupo)
  if (!bruto.ok) return bruto

  const transacoes = bruto.transacoes
    .filter(t => t.tipo === 'CREDIT'
      && (OPERACOES_CONCILIAVEIS.includes(t.operationType) || ehTransferenciaEntreContas(t.descricao))
      && bancoEntraNoPix(t.banco, cnpjGrupo))
    .map(t => ({
      contaId: t.contaId,
      banco: t.banco,
      transacaoId: t.transacaoId,
      data: t.data,
      valor: t.valor,
      pagadorNome: t.paymentData?.payer?.trim() || extrairContraparteDaDescricao(t.descricao),
      descricao: t.descricao,
      tipoOperacao: OPERACOES_CONCILIAVEIS.includes(t.operationType)
        ? t.operationType
        : TIPO_TRANSFERENCIA_CONTAS,
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
    .filter(t => t.tipo === 'DEBIT' && bancoEntraNaDespesa(t.banco, cnpjGrupo))
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


// ─── Cartão de crédito ───────────────────────────────────────────────────────

export type CartaoDoGrupo = {
  accountId: string
  banco: string
  nome: string
  /** Final do cartão titular da conta. */
  final: string
  limite: number | null
  usado: number | null
  faturas: Fatura[]
}

type ResultadoCartoes =
  | { ok: true; cartoes: CartaoDoGrupo[] }
  | { ok: false; erro: string }

/** Extrai o payload de um tools/call, ou null quando a chamada não deu certo. */
function payloadDe(resposta: RespostaMcp): Record<string, unknown> | null {
  if (resposta.json.error) return null
  const result = resposta.json.result as { content?: { text?: string }[] } | undefined
  const texto = result?.content?.[0]?.text
  if (!texto) return null
  try {
    return JSON.parse(texto) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Todos os lançamentos de um cartão.
 *
 * Pagina até o fim porque `from`/`to` da ferramenta não filtram nada (mesma
 * pegadinha do PIX): o corte por período é sempre no código. O teto de páginas
 * existe só para uma conta com histórico absurdo não travar a tela — em
 * 04/09/2026 o cartão do Sicoob tinha 616 lançamentos, duas páginas.
 */
async function buscarLancamentosCartao(sessionId: string, accountId: string): Promise<LancamentoBruto[]> {
  const MAX_PAGINAS = 6
  const todos: LancamentoBruto[] = []

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resposta = await chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'openfinance_list_transactions',
        arguments: { account_id: accountId, detail: 'rich', page_size: 500, page: pagina },
      },
    })
    const payload = payloadDe(resposta) as { results?: LancamentoBruto[]; totalPages?: number } | null
    const linhas = payload?.results ?? []
    todos.push(...linhas)
    if (linhas.length === 0 || pagina >= (payload?.totalPages ?? 1)) break
  }

  return todos
}

/**
 * Faturas dos cartões de crédito do grupo, com os lançamentos separados por
 * cartão.
 *
 * O vínculo com o CNPJ é indireto de propósito: a conta CREDIT não traz
 * `taxNumber` (só a BANK traz), então o de-para sai do `item_id`, que é a
 * conexão — o mesmo item que responde pela conta corrente responde pelo cartão.
 * Sem esse filtro a tela do Sul de Minas mostraria o cartão da BH, que foi
 * exatamente o que aconteceu com os saldos em 20/08/2026.
 */
export async function buscarFaturasCartao(cnpjGrupo: string): Promise<ResultadoCartoes> {
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
    if (init.json.error) return { ok: false, erro: init.json.error.message ?? 'Erro ao iniciar sessão com mcp.ai' }
    if (!init.sessionId) return { ok: false, erro: 'mcp.ai não retornou identificador de sessão' }
    const sessionId = init.sessionId

    const contas = payloadDe(await chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'openfinance_list_accounts', arguments: { type: 'BANK' } },
    })) as { results?: { item_id: string; taxNumber: string }[] } | null
    if (!contas) return { ok: false, erro: 'Não foi possível identificar as conexões do grupo' }

    const cnpjPorItem = new Map<string, string>()
    for (const c of contas.results ?? []) {
      if (c.item_id && c.taxNumber) cnpjPorItem.set(c.item_id, c.taxNumber)
    }

    const cartoesBrutos = payloadDe(await chamarMcp(sessionId, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'openfinance_list_accounts', arguments: { type: 'CREDIT' } },
    })) as { results?: Array<{
      account_id: string
      bank: string
      name: string
      number: string
      item_id: string
      creditData?: { creditLimit?: string | null; usedAmount?: string | null }
    }> } | null
    if (!cartoesBrutos) return { ok: false, erro: 'Erro ao buscar os cartões no mcp.ai' }

    const doGrupo = (cartoesBrutos.results ?? []).filter(c => mesmoCnpj(cnpjPorItem.get(c.item_id), cnpjGrupo))

    // Um cartão de cada vez, e NÃO em Promise.all.
    //
    // Duas chamadas simultâneas da mesma ferramenta na mesma sessão MCP têm as
    // respostas cruzadas: com Sicoob e Sicredi em paralelo, o Sicoob recebeu a
    // lista de faturas VAZIA do Sicredi e a tela mostrou todas as faturas dele
    // como "em aberto", sem total. São dois ou três cartões por grupo — não vale
    // o risco de paralelizar.
    const cartoes: CartaoDoGrupo[] = []
    for (const c of doGrupo) {
      const faturasPayload = payloadDe(await chamarMcp(sessionId, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'openfinance_list_credit_card_bills',
          arguments: { account_id: c.account_id, include_open_bill: true, page_size: 12 },
        },
      })) as { results?: FaturaBruta[] } | null
      const lancamentos = await buscarLancamentosCartao(sessionId, c.account_id)

      const numero = (v: string | null | undefined) => (v == null || v === '' ? null : Number(v))
      cartoes.push({
        accountId: c.account_id,
        banco: c.bank,
        nome: c.name,
        final: c.number,
        limite: numero(c.creditData?.creditLimit),
        usado: numero(c.creditData?.usedAmount),
        faturas: agruparEmFaturas(lancamentos, faturasPayload?.results ?? []),
      })
    }

    return { ok: true, cartoes }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro ao conectar com o mcp.ai' }
  }
}
