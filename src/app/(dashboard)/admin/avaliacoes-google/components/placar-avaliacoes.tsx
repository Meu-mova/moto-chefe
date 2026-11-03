import { Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { hojeBrt } from '@/lib/data-venda'
import type { LinhaLoja, LinhaVendedor, Placar, ProgressoMeta } from '@/lib/avaliacoes-google/placar'
import { cn } from '@/lib/utils'

/** Percentual do realizado; verde só quando chega na meta. Sem vermelho: o primeiro mês é de acompanhamento. */
function Pct({ linha, metaPct }: { linha: ProgressoMeta; metaPct: number }) {
  if (linha.pct === null) return <span className="text-muted-foreground">—</span>
  return <span className={cn('font-semibold', linha.pct >= metaPct && 'text-success')}>{linha.pct}%</span>
}

/** Primeira leitura depois do dia 1: as avaliações anteriores a ela não entram na conta. */
function desdeParcial(desde: string | null, mes: string): string | null {
  if (!desde) return null
  const dia = hojeBrt(new Date(desde))
  return dia > `${mes}-01` ? `desde ${dia.slice(8, 10)}/${dia.slice(5, 7)}` : null
}

function TabelaLojas({ lojas, mes, metaPct }: { lojas: LinhaLoja[]; mes: string; metaPct: number }) {
  return (
    <section aria-label="Avaliações novas por loja" className="space-y-2">
      <h3 className="text-sm font-semibold">Por loja: avaliações novas ÷ vendas</h3>
      <p className="text-xs text-muted-foreground">
        O resultado real no Google. Pode incluir avaliação de quem não comprou moto, como clientes de OS.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 font-medium">Loja</th>
              <th className="font-medium text-right">Vendas</th>
              <th className="font-medium text-right">Avaliações novas</th>
              <th className="font-medium text-right">% das vendas</th>
              <th className="font-medium text-right">Faltam</th>
              <th className="font-medium text-right">Toques</th>
            </tr>
          </thead>
          <tbody>
            {lojas.map(l => {
              const desde = desdeParcial(l.desde, mes)
              return (
                <tr key={l.lojaId} className="border-t">
                  <td className="py-2 pr-3">{l.nome}</td>
                  <td className="text-right tabular-nums">{l.vendas}</td>
                  <td className="text-right tabular-nums">
                    {l.novas ?? <span className="text-muted-foreground">sem leitura</span>}
                    {desde && <span className="block text-xs text-muted-foreground">{desde}</span>}
                  </td>
                  <td className="text-right tabular-nums"><Pct linha={l} metaPct={metaPct} /></td>
                  <td className="text-right tabular-nums">{l.novas === null ? '—' : l.faltam}</td>
                  <td className="text-right tabular-nums">{l.toques}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TabelaVendedores({ vendedores, metaPct }: { vendedores: LinhaVendedor[]; metaPct: number }) {
  return (
    <section aria-label="Toques por vendedor" className="space-y-2">
      <h3 className="text-sm font-semibold">Por vendedor: toques ÷ vendas</h3>
      <p className="text-xs text-muted-foreground">
        Toque não é avaliação: mostra se o vendedor está oferecendo. O Google não diz de qual placa veio cada avaliação.
      </p>
      {vendedores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma venda ou toque neste mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 font-medium">Vendedor</th>
                <th className="font-medium">Loja</th>
                <th className="font-medium text-right">Vendas</th>
                <th className="font-medium text-right">Toques</th>
                <th className="font-medium text-right">Toques ÷ vendas</th>
                <th className="font-medium text-right">Faltam</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map(v => (
                <tr key={`${v.usuarioId}-${v.lojaId}`} className="border-t">
                  <td className="py-2 pr-3">{v.nome}</td>
                  <td className="pr-3 text-muted-foreground">{v.lojaNome}</td>
                  <td className="text-right tabular-nums">{v.vendas}</td>
                  {v.temPlaca || v.toques > 0 ? (
                    <>
                      <td className="text-right tabular-nums">{v.toques}</td>
                      <td className="text-right tabular-nums"><Pct linha={v} metaPct={metaPct} /></td>
                      <td className="text-right tabular-nums">{v.faltam}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="text-right text-muted-foreground">Sem placa</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Vendas × toques × avaliações novas no mês escolhido, contra a meta do grupo. */
export function PlacarAvaliacoes({ placar }: { placar: Placar }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Target size={18} /> Placar do mês</CardTitle>
        <p className="text-xs text-muted-foreground">
          Meta do grupo: avaliação em {placar.metaPct}% das vendas de moto do mês.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <TabelaLojas lojas={placar.lojas} mes={placar.mes} metaPct={placar.metaPct} />
        <TabelaVendedores vendedores={placar.vendedores} metaPct={placar.metaPct} />
      </CardContent>
    </Card>
  )
}
