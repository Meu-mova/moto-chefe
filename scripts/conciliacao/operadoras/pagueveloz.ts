import type { BrowserContext } from 'playwright'
import { SessaoExpirada } from '../navegador'
import { mapearPagueVeloz, type OperacaoPagueVeloz } from '../../../src/lib/conciliacao-pagueveloz'
import type { TransacaoCartao } from '../../../src/lib/conciliacao-cartao'

// A PagueVeloz espera DD/MM/AAAA, não ISO — diferente das outras duas.
function ddmmaaaa(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const [ano, mes, dia] = brt.toISOString().slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export async function coletarPagueVeloz(
  contexto: BrowserContext,
  inicio: Date,
  fim: Date,
): Promise<TransacaoCartao[]> {
  const pagina = await contexto.newPage()

  try {
    await pagina.goto('https://www.pagueveloz.com.br/conta/maquininha/relatorios/operacoes/', { waitUntil: 'domcontentloaded' })
    if (pagina.url().includes('/entrar')) throw new SessaoExpirada('PagueVeloz')

    // Aqui não há Bearer: a chamada é same-origin e vai com o cookie da sessão.
    const operacoes: OperacaoPagueVeloz[] = await pagina.evaluate(async ({ de, ate }) => {
      const url = `/api/v2/PagamentoCartao/ObterRelatorioOperacoes?TipoData=venda&equipamento=todos&inicio=${de}&fim=${ate}`
      const r = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } })
      if (r.status === 401 || r.status === 403) throw new Error('SESSAO')
      if (!r.ok) throw new Error(`ObterRelatorioOperacoes respondeu ${r.status}`)
      const json = await r.json()
      if (!Array.isArray(json)) throw new Error('resposta não é array — endpoint mudou?')
      return json
    }, { de: ddmmaaaa(inicio), ate: ddmmaaaa(fim) })

    const transacoes = mapearPagueVeloz(operacoes)
    await pagina.close()
    return transacoes
  } catch (e) {
    const sessaoExpirada = e instanceof SessaoExpirada
      ? e
      : e instanceof Error && e.message.includes('SESSAO') ? new SessaoExpirada('PagueVeloz') : null

    // Sessão vencida: a página fica aberta na tela de login para alguém
    // entrar ali mesmo — fechar obrigaria a rodar tudo de novo só para ver a
    // tela de login. Nos demais erros (e no sucesso, acima), fecha normalmente.
    if (!sessaoExpirada) await pagina.close()
    throw sessaoExpirada ?? e
  }
}
