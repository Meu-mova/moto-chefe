import type { BrowserContext } from 'playwright'
import { abrirComToken, SessaoExpirada } from '../navegador'
import { mapearStone, type VendaStone, type DetalheStone } from '../../../src/lib/conciliacao-stone'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

const HOST = 'https://payments-api-gateway-prd.pagar.me/payments-web-bff/sales/v1/organizations'

// Teto de segurança: se o cursor de paginação nunca esvaziar (bug da API, ou
// devolvendo a mesma página sempre), estoura erro claro em vez de travar o
// processo — bem acima do volume real (algumas dezenas de vendas por semana).
const MAX_PAGINAS = 50

export async function coletarStone(
  contexto: BrowserContext,
  cnpj: string,          // com pontuação, como em grupos.cnpj
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const { pagina, authorization } = await abrirComToken(
    contexto, 'https://conta.stone.com.br/vendas', /payments-web-bff\/sales/,
  )

  try {
    if (!authorization) throw new SessaoExpirada('Stone')

    const cnpjLimpo = cnpj.replace(/\D/g, '')

    // A lista não traz NSU nem líquido: os dois só existem no detalhe, então é
    // uma chamada por venda. Com ~5 vendas por semana, é barato.
    const pares = await pagina.evaluate(async ({ host, cnpjLimpo, auth, from, to, maxPaginas }) => {
      const headers = { authorization: auth, 'x-institution': 'stone', accept: 'application/json' }
      const base = `${host}/${cnpjLimpo}`

      const vendas: Record<string, unknown>[] = []
      let url = `${base}?size=100&start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`
      let contagemPaginas = 0
      while (url) {
        if (++contagemPaginas > maxPaginas) throw new Error(`sales/v1 passou de ${maxPaginas} páginas — cursor não esvazia?`)
        const r = await fetch(url, { headers })
        if (!r.ok) throw new Error(`sales/v1 respondeu ${r.status}`)
        const json = await r.json()
        if (!Array.isArray(json.items)) throw new Error('resposta sem items[] — endpoint mudou?')
        vendas.push(...json.items)
        url = json.next
          ? `${base}?size=100&page=${json.next}&start_date=${encodeURIComponent(from)}&end_date=${encodeURIComponent(to)}`
          : ''
      }

      const saida = []
      for (const venda of vendas) {
        const r = await fetch(`${base}/details/${(venda as { id: string }).id}`, { headers })
        saida.push({ venda, detalhe: r.ok ? await r.json() : null })
      }
      return saida
    }, { host: HOST, cnpjLimpo, auth: authorization, from: inicio.toISOString(), to: fim.toISOString(), maxPaginas: MAX_PAGINAS })

    const transacoes = mapearStone(pares as unknown as { venda: VendaStone; detalhe: DetalheStone | null }[])
    await pagina.close()
    return transacoes
  } catch (e) {
    // Sessão vencida: a página fica aberta na tela de login para alguém
    // entrar ali mesmo — fechar obrigaria a rodar tudo de novo só para ver a
    // tela de login. Nos demais erros (e no sucesso, acima), fecha normalmente.
    if (!(e instanceof SessaoExpirada)) await pagina.close()
    throw e
  }
}
