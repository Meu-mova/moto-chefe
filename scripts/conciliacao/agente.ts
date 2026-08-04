/**
 * Agente de importação de vendas de cartão.
 *
 * Uso:
 *   npx dotenv -e .env.local -- npx tsx scripts/conciliacao/agente.ts --grupo=sul-de-minas
 *
 * Fica perguntando ao MOVA, a cada 15 segundos, se alguém clicou no botão do
 * dashboard. Quando tem pedido, coleta as três operadoras e devolve o resultado.
 *
 * PRIMEIRA EXECUÇÃO: uma janela do Chromium abre em cada painel. Faça o login
 * de cada operadora ali (a InfinitePay é por QR Code no app). As sessões ficam
 * salvas no perfil; a da InfinitePay dura 7 dias, as outras até você sair.
 */
import { abrirPerfil, avisar, SessaoExpirada, BASE_COLETOR } from './navegador'
import { coletarInfinitePay } from './operadoras/infinitepay'
import { coletarStone } from './operadoras/stone'
import { coletarPagueVeloz } from './operadoras/pagueveloz'
import type { TransacaoCartao, Operadora } from '../../src/lib/conciliacao-cartao'

const GRUPOS = {
  'sul-de-minas': { cnpj: '57.113.017/0001-72', nome: 'Sul de Minas' },
  'bh':           { cnpj: '63.009.605/0001-63', nome: 'BH' },
} as const

const INTERVALO_MS = 15_000
const DIAS_PADRAO = 7

const slug = (process.argv.find(a => a.startsWith('--grupo='))?.split('=')[1] || '') as keyof typeof GRUPOS
const grupo = GRUPOS[slug]
if (!grupo) { console.error(`Use --grupo=<${Object.keys(GRUPOS).join('|')}>`); process.exit(1) }

const { MOVA_URL, CRON_SECRET, TELEGRAM_CHAT_ID } = process.env
if (!MOVA_URL || !CRON_SECRET) { console.error('MOVA_URL e CRON_SECRET faltando no .env.local'); process.exit(1) }

const cabecalho = { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET }

async function enviar(operadora: Operadora, transacoes: TransacaoCartao[]) {
  if (transacoes.length === 0) return { importadas: 0, duplicadas: 0, conciliadas: 0 }
  const r = await fetch(`${MOVA_URL}/api/conciliacao/cartao`, {
    method: 'POST',
    headers: cabecalho,
    body: JSON.stringify({ operadora, grupoCnpj: grupo.cnpj, transacoes }),
  })
  if (!r.ok) throw new Error(`MOVA respondeu ${r.status} para ${operadora}: ${await r.text()}`)
  return await r.json()
}

async function processar(pedidoId: string) {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - DIAS_PADRAO * 24 * 60 * 60 * 1000)
  const contexto = await abrirPerfil(slug)

  const resultado: Record<string, unknown> = {}
  const falhas: string[] = []
  let precisaLogin = false

  const etapas: [Operadora, () => Promise<TransacaoCartao[]>][] = [
    ['infinitypay', () => coletarInfinitePay(contexto, inicio, fim)],
    ['stone',       () => coletarStone(contexto, grupo.cnpj, inicio, fim)],
    ['pagueveloz',  () => coletarPagueVeloz(contexto, inicio, fim)],
  ]

  try {
    // Uma operadora que falha não derruba as outras: o que deu certo é gravado
    // e o pedido volta como erro dizendo o que faltou.
    for (const [operadora, coletar] of etapas) {
      try {
        resultado[operadora] = await enviar(operadora, await coletar())
      } catch (e) {
        if (e instanceof SessaoExpirada) precisaLogin = true
        const msg = e instanceof Error ? e.message : String(e)
        falhas.push(`${operadora}: ${msg}`)
        await avisar(TELEGRAM_CHAT_ID, `Importação de cartão (${grupo.nome}) — ${operadora}: ${msg}`)
      }
    }
  } finally {
    // Cada coletor já fechou sua própria página quando deu certo ou deu erro
    // comum; quando a sessão de uma operadora vence, o coletor correspondente
    // deixa a página dele aberta de propósito (tela de login, ou QR da
    // InfinitePay) para alguém entrar ali mesmo — fechar obrigaria a rodar
    // tudo de novo só para ver a tela de login. Por isso o contexto inteiro só
    // é fechado aqui se nenhuma sessão venceu: fechá-lo agora fecharia também
    // essa página pendente, já que fechar o contexto fecha todas as páginas.
    if (!precisaLogin) await contexto.close()
  }

  await fetch(`${MOVA_URL}/api/conciliacao/fila`, {
    method: 'POST',
    headers: cabecalho,
    body: JSON.stringify({ id: pedidoId, resultado, erro: falhas.length ? falhas.join(' | ') : undefined }),
  })

  console.log(`[${new Date().toISOString()}] pedido ${pedidoId}:`, JSON.stringify(resultado), falhas.join(' | '))
}

console.log(`Agente de cartão no ar — grupo ${grupo.nome}, perfis em ${BASE_COLETOR}`)

setInterval(async () => {
  try {
    const r = await fetch(
      `${MOVA_URL}/api/conciliacao/fila?grupoCnpj=${encodeURIComponent(grupo.cnpj)}`,
      { headers: cabecalho },
    )
    if (!r.ok) return
    const { pedido } = await r.json() as { pedido: { id: string } | null }
    if (pedido) await processar(pedido.id)
  } catch (e) {
    console.error('laço do agente:', e instanceof Error ? e.message : String(e))
  }
}, INTERVALO_MS)
