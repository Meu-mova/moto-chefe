import type { BrowserContext } from 'playwright'
import { abrirComToken, SessaoExpirada } from '../navegador'
import { mapearInfinitePay, type VendaInfinitePay } from '../../../src/lib/conciliacao-infinitepay'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

const HOST = 'https://infinitepay-sales-indexer.services.production.infinitepay.io'

// Teto de segurança: se o cursor de paginação nunca esvaziar (bug da API, ou
// devolvendo a mesma página sempre), estoura erro claro em vez de travar o
// processo — bem acima do volume real (algumas dezenas de vendas por semana).
const MAX_PAGINAS = 50

export async function coletarInfinitePay(
  contexto: BrowserContext,
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const { pagina } = await abrirComToken(contexto, 'https://app.infinitepay.io/sales', /sales-index/)

  try {
    if (await pagina.getByText('escaneie o QR', { exact: false }).count() > 0) {
      throw new SessaoExpirada('InfinitePay')
    }
    await pagina.waitForTimeout(5000)  // o app mina o token logo após carregar

    const vendas = await pagina.evaluate(async ({ host, from, to, maxPaginas }) => {
      const token = localStorage.getItem('jwtReadToken')
      if (!token) throw new Error('jwtReadToken ausente — app não terminou de carregar')

      const todas: unknown[] = []
      let url = `${host}/sales-index/v1/sales/search?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&pg=true&limit=100`
      let contagemPaginas = 0
      while (url) {
        if (++contagemPaginas > maxPaginas) throw new Error(`sales/search passou de ${maxPaginas} páginas — cursor não esvazia?`)
        const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) throw new Error(`sales/search respondeu ${r.status}`)
        const json = await r.json()
        if (!Array.isArray(json.results)) throw new Error('resposta sem results[] — endpoint mudou?')
        todas.push(...json.results)
        url = json.pagination?.next_page || ''
      }
      return todas
    }, { host: HOST, from: inicio.toISOString(), to: fim.toISOString(), maxPaginas: MAX_PAGINAS }) as unknown as VendaInfinitePay[]

    const transacoes = mapearInfinitePay(vendas)
    await pagina.close()
    return transacoes
  } catch (e) {
    // Sessão vencida: a página fica aberta na tela de QR para alguém entrar
    // ali mesmo — fechar obrigaria a rodar tudo de novo só para ver a tela de
    // login. Nos demais erros (e no sucesso, acima), fecha normalmente.
    if (!(e instanceof SessaoExpirada)) await pagina.close()
    throw e
  }
}
