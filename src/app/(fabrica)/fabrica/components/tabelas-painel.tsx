// Tabelas do Painel da Fábrica. Sem estado nem 'use client': a tela e o impresso
// (src/app/(print)/fabrica/imprimir) mostram exatamente o mesmo.
import Link from 'next/link'
import {
  agruparVendas, resumirEstoque, resumirVendas, urlDoFiltro,
  type FiltroPainel, type LinhaEstoquePainel, type LojaPainel, type VendaPainel,
} from '@/lib/painel-fabrica'

const n = (v: number) => v.toLocaleString('pt-BR')
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const th = 'px-3 py-2 text-xs font-medium text-muted-foreground'
const td = 'px-3 py-1.5'
const caixa = 'bg-card border rounded-lg overflow-x-auto'

function Cabecalho({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">{detalhe}</p>
    </div>
  )
}

export function TabelaEstoque({ lojas, estoque }: { lojas: LojaPainel[]; estoque: LinhaEstoquePainel[] }) {
  const e = resumirEstoque(estoque)
  const nomeLoja = new Map(lojas.map(l => [l.lojaId, l]))
  const lojasComEstoque = e.porLoja
    .map(p => ({ loja: nomeLoja.get(p.chave), quantidade: p.quantidade }))
    .filter(p => p.loja)
    .sort((a, b) => b.quantidade - a.quantidade || a.loja!.lojaNome.localeCompare(b.loja!.lojaNome, 'pt-BR'))

  return (
    <section className="space-y-3">
      <Cabecalho titulo="Estoque geral por modelo e cor" detalhe={`${n(e.total)} motos em estoque hoje`} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className={caixa}>
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr><th className={`${th} text-left`}>Modelo</th><th className={`${th} text-left`}>Cor</th><th className={`${th} text-right`}>Qtd</th></tr>
            </thead>
            <tbody className="divide-y">
              {e.modeloCor.length === 0 && (
                <tr><td colSpan={3} className={`${td} py-6 text-center text-muted-foreground`}>Nenhuma moto MotoChefe em estoque com estes filtros.</td></tr>
              )}
              {e.porModelo.map(m => [
                ...e.modeloCor.filter(l => l.modelo === m.chave).map((l, i) => (
                  <tr key={`${l.modelo}-${l.cor}`}>
                    <td className={`${td} font-medium`}>{i === 0 ? l.modelo : ''}</td>
                    <td className={td}>{l.cor}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(l.quantidade)}</td>
                  </tr>
                )),
                <tr key={`${m.chave}-total`} className="bg-muted/50">
                  <td className={`${td} text-xs text-muted-foreground`} colSpan={2}>Total {m.chave}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{n(m.quantidade)}</td>
                </tr>,
              ])}
            </tbody>
            {e.total > 0 && (
              <tfoot className="border-t-2">
                <tr><td className={`${td} font-semibold`} colSpan={2}>Total geral</td><td className={`${td} text-right font-bold tabular-nums`}>{n(e.total)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className={`${caixa} self-start`}>
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr><th className={`${th} text-left`}>Estoque por loja</th><th className={`${th} text-right`}>Qtd</th></tr>
            </thead>
            <tbody className="divide-y">
              {lojasComEstoque.length === 0 && (
                <tr><td colSpan={2} className={`${td} py-6 text-center text-muted-foreground`}>—</td></tr>
              )}
              {lojasComEstoque.map(p => (
                <tr key={p.loja!.lojaId}>
                  <td className={td}>
                    <span className="font-medium">{p.loja!.lojaNome}</span>
                    <span className="block text-xs text-muted-foreground">{p.loja!.cidade}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{n(p.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function TabelaVendas({ lojas, vendas, periodo, filtro, de, ate, impresso = false }: {
  lojas: LojaPainel[]
  /** Já filtradas (filtrarVendas): uma linha por moto vendida. */
  vendas: VendaPainel[]
  /** "01/11/2026 a 09/11/2026" */
  periodo: string
  filtro: FiltroPainel
  de: string
  ate: string
  /** No papel, sem links. */
  impresso?: boolean
}) {
  const v = resumirVendas(agruparVendas(vendas))
  const loja = new Map(lojas.map(l => [l.lojaId, l]))
  const lojasComVenda = lojas
    .filter(l => (v.porLoja.get(l.lojaId) ?? 0) > 0)
    .sort((a, b) => (v.porLoja.get(b.lojaId) ?? 0) - (v.porLoja.get(a.lojaId) ?? 0) || a.lojaNome.localeCompare(b.lojaNome, 'pt-BR'))
  // Clicar na loja filtra só ela, mantendo modelo, cor e período.
  const soDaLoja = (lojaId: string) => `/fabrica?${urlDoFiltro({ ...filtro, lojas: [lojaId] }, de, ate, 'vendas')}`

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Cabecalho titulo="Vendas por loja" detalhe={`${periodo} · ${n(v.total)} motos`} />
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div className={`${caixa} self-start`}>
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr><th className={`${th} text-left`}>Loja</th><th className={`${th} text-right`}>Motos vendidas</th></tr>
              </thead>
              <tbody className="divide-y">
                {lojasComVenda.length === 0 && (
                  <tr><td colSpan={2} className={`${td} py-6 text-center text-muted-foreground`}>Nenhuma venda no período com estes filtros.</td></tr>
                )}
                {lojasComVenda.map(l => (
                  <tr key={l.lojaId}>
                    <td className={td}>
                      {impresso
                        ? <span className="font-medium">{l.lojaNome}</span>
                        : <Link href={soDaLoja(l.lojaId)} className="font-medium text-primary-text hover:underline">{l.lojaNome}</Link>}
                      <span className="block text-xs text-muted-foreground">{l.cidade} · {l.grupoNome}</span>
                    </td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>{n(v.porLoja.get(l.lojaId) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              {v.total > 0 && (
                <tfoot className="border-t-2">
                  <tr><td className={`${td} font-semibold`}>Total</td><td className={`${td} text-right font-bold tabular-nums`}>{n(v.total)}</td></tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className={`${caixa} self-start`}>
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className={`${th} text-left sticky left-0 bg-muted`}>Loja × modelo</th>
                  {v.modelos.map(m => <th key={m} className={`${th} text-right whitespace-nowrap`}>{m}</th>)}
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lojasComVenda.length === 0 && (
                  <tr><td colSpan={v.modelos.length + 2} className={`${td} py-6 text-center text-muted-foreground`}>—</td></tr>
                )}
                {lojasComVenda.map(l => (
                  <tr key={l.lojaId}>
                    <td className={`${td} font-medium whitespace-nowrap sticky left-0 bg-card`}>{l.lojaNome}</td>
                    {v.modelos.map(m => {
                      const q = v.celula(l.lojaId, m)
                      return <td key={m} className={`${td} text-right tabular-nums ${q === 0 ? 'text-muted-foreground' : ''}`}>{q === 0 ? '—' : n(q)}</td>
                    })}
                    <td className={`${td} text-right font-semibold tabular-nums`}>{n(v.porLoja.get(l.lojaId) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              {v.total > 0 && (
                <tfoot className="border-t-2">
                  <tr>
                    <td className={`${td} font-semibold sticky left-0 bg-card`}>Total</td>
                    {v.modelos.map(m => <td key={m} className={`${td} text-right font-semibold tabular-nums`}>{n(v.porModelo.get(m) ?? 0)}</td>)}
                    <td className={`${td} text-right font-bold tabular-nums`}>{n(v.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-3 break-before-page">
        <Cabecalho titulo="Detalhes das vendas" detalhe={`${n(vendas.length)} vendas, da mais recente para a mais antiga`} />
        <div className={caixa}>
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className={`${th} text-left`}>Data</th>
                <th className={`${th} text-left`}>Venda</th>
                <th className={`${th} text-left`}>Loja</th>
                <th className={`${th} text-left`}>Modelo</th>
                <th className={`${th} text-left`}>Cor</th>
                <th className={`${th} text-left`}>Chassi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendas.length === 0 && (
                <tr><td colSpan={6} className={`${td} py-6 text-center text-muted-foreground`}>Nenhuma venda no período com estes filtros.</td></tr>
              )}
              {vendas.map(x => (
                <tr key={x.vendaId}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{dataHora(x.data)}</td>
                  <td className={`${td} tabular-nums`}>{x.numero}</td>
                  <td className={`${td} whitespace-nowrap`}>{loja.get(x.lojaId)?.lojaNome ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap font-medium`}>{x.modelo}</td>
                  <td className={td}>{x.cor}</td>
                  <td className={`${td} font-mono text-xs whitespace-nowrap`}>{x.chassi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
