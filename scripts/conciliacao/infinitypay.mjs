/**
 * Busca transações de cartão na InfinityPay e envia ao MOVA para conciliação.
 *
 * SETUP:
 * 1. Faça login em app.infinitepay.io via QR Code no seu browser
 * 2. Abra DevTools → Network → filtre por "api"
 * 3. Clique em qualquer transação/venda na tela
 * 4. Copie a URL da requisição e o header "Authorization: Bearer <token>"
 * 5. Coloque o token em INFINITYPAY_TOKEN nos GitHub Secrets
 * 6. Atualize INFINITYPAY_API_BASE e INFINITYPAY_SALES_PATH abaixo
 */

// ── Configuração (preencher após inspecionar o Network) ─────────────────────
const API_BASE      = process.env.INFINITYPAY_API_BASE   // ex: https://api.infinitepay.io
const SALES_PATH    = process.env.INFINITYPAY_SALES_PATH  // ex: /v2/transactions ou /v1/sales
const TOKEN         = process.env.INFINITYPAY_TOKEN
const MOVA_URL      = process.env.MOVA_URL               // https://moto-chefe.vercel.app
const CRON_SECRET   = process.env.CRON_SECRET

if (!API_BASE || !SALES_PATH || !TOKEN || !MOVA_URL || !CRON_SECRET) {
  console.error('Variáveis de ambiente faltando. Configure os GitHub Secrets.')
  process.exit(1)
}

// Período: últimas 8 horas (cobre a janela entre as rodadas das 13h e 17h)
const agora = new Date()
const inicio = new Date(agora.getTime() - 8 * 60 * 60 * 1000)

const params = new URLSearchParams({
  start_date: inicio.toISOString().split('T')[0],
  end_date:   agora.toISOString().split('T')[0],
  page:       '1',
  per_page:   '200',
})

console.log(`[InfinityPay] Buscando transações de ${params.get('start_date')} a ${params.get('end_date')}...`)

const resp = await fetch(`${API_BASE}${SALES_PATH}?${params}`, {
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type':  'application/json',
  },
})

if (!resp.ok) {
  console.error(`[InfinityPay] Erro ${resp.status}:`, await resp.text())
  process.exit(1)
}

const data = await resp.json()

// ── Normalização do payload ──────────────────────────────────────────────────
// Ajuste os campos conforme a resposta real da API InfinityPay
const transacoes = (data.transactions ?? data.sales ?? data.data ?? []).map(t => ({
  nsu:           t.nsu ?? t.id ?? t.transaction_id,
  autorizacao:   t.authorization_code ?? t.auth_code,
  dataTransacao: (t.created_at ?? t.date ?? '').split('T')[0],
  valorBruto:    parseFloat(t.amount ?? t.gross_amount ?? t.value ?? '0') / 100, // centavos → reais
  valorLiquido:  t.net_amount != null ? parseFloat(t.net_amount) / 100 : undefined,
  parcelas:      parseInt(t.installments ?? t.parcelas ?? '1', 10),
  tipo:          (t.payment_type ?? t.type ?? 'credit').toLowerCase().includes('debit') ? 'debito' : 'credito',
  status:        t.status ?? 'aprovado',
  rawData:       t,
}))

console.log(`[InfinityPay] ${transacoes.length} transações encontradas`)

if (transacoes.length === 0) process.exit(0)

const movaResp = await fetch(`${MOVA_URL}/api/conciliacao/cartao`, {
  method:  'POST',
  headers: {
    'Content-Type':   'application/json',
    'x-cron-secret':  CRON_SECRET,
  },
  body: JSON.stringify({ operadora: 'infinitypay', transacoes }),
})

const resultado = await movaResp.json()
console.log('[MOVA] Resultado:', resultado)

if (!movaResp.ok) process.exit(1)
