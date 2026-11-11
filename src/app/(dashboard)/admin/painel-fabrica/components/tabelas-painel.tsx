// Tabelas do Painel da Fábrica. Sem estado nem 'use client': a tela e o impresso
// (src/app/(print)/admin/painel-fabrica/imprimir) mostram exatamente o mesmo.
import {
  resumirEstoque, resumirVendas,
  type LinhaEstoquePainel, type LinhaVendaPainel, type LojaPainel,
} from '@/lib/painel-fabrica'

const n = (v: number) => v.toLocaleString('pt-BR')

const th = 'px-3 py-2 text-xs font-medium text-muted-foreground'
const td = 'px-3 py-1.5'

export function TabelasPainel({ lojas, estoque, vendas, periodo }: {
  lojas: LojaPainel[]
  estoque: LinhaEstoquePainel[]
  vendas: LinhaVendaPainel[]
  /** "01/11/2026 a 09/11/2026" */
  periodo: string
}) {
  const e = resumirEstoque(estoque)
  const v = resumirVendas(vendas)
  const nomeLoja = new Map(lojas.map(l => [l.lojaId, l]))
  const lojasComEstoque = e.porLoja
    .map(p => ({ loja: nomeLoja.get(p.chave), quantidade: p.quantidade }))
    .filter(p => p.loja)
    .sort((a, b) => b.quantidade - a.quantidade || a.loja!.lojaNome.localeCompare(b.loja!.lojaNome, 'pt-BR'))
  const lojasComVenda = lojas.filter(l => (v.porLoja.get(l.lojaId) ?? 0) > 0)

  return (
    <div className="space-y-8">
      <section className="space-y-3 break-inside-avoid">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Estoque geral por modelo e cor</h2>
          <p className="text-sm text-muted-foreground">{n(e.total)} motos</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="bg-card border rounded-lg overflow-x-auto">
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

          <div className="bg-card border rounded-lg overflow-x-auto self-start">
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

      <section className="space-y-3 break-before-page">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Vendas por loja e modelo</h2>
          <p className="text-sm text-muted-foreground">{periodo} · {n(v.total)} motos</p>
        </div>
        <div className="bg-card border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className={`${th} text-left sticky left-0 bg-muted`}>Loja</th>
                {v.modelos.map(m => <th key={m} className={`${th} text-right whitespace-nowrap`}>{m}</th>)}
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lojasComVenda.length === 0 && (
                <tr><td colSpan={v.modelos.length + 2} className={`${td} py-6 text-center text-muted-foreground`}>Nenhuma venda de moto MotoChefe no período com estes filtros.</td></tr>
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
      </section>
    </div>
  )
}
