import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TotalDespesas } from '@/lib/despesas-operacionais'

type Props = {
  foraPorCategoria: TotalDespesas['foraPorCategoria']
  /** Para mostrar quanto do resultado do mês as retiradas já consumiram. */
  lucroLiquido: number
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoRetiradas({ foraPorCategoria, lucroLiquido }: Props) {
  const retiradas = foraPorCategoria.filter(f => f.motivo === 'retirada_socio')
  const total = retiradas.reduce((s, r) => s + r.total, 0)
  const acimaDoLucro = lucroLiquido > 0 && total > lucroLiquido

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-500">Retiradas de Sócios</CardTitle>
        <p className="text-xs text-slate-400">
          distribuição de lucro — fora das despesas operacionais
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-slate-700 mb-3">{fmt(total)}</p>

        <div className="space-y-1.5">
          {retiradas.map(r => (
            <div key={r.categoria} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{r.categoria}</span>
              <span className="font-mono text-slate-600 whitespace-nowrap">
                {fmt(r.total)}
                {total > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {((r.total / total) * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          ))}
          {retiradas.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">Nenhuma retirada no período.</p>
          )}
        </div>

        {total > 0 && lucroLiquido > 0 && (
          <p className={`text-xs mt-3 pt-2 border-t ${acimaDoLucro ? 'text-red-600' : 'text-slate-400'}`}>
            {acimaDoLucro
              ? `Acima do resultado do mês — o lucro líquido foi ${fmt(lucroLiquido)}.`
              : `${((total / lucroLiquido) * 100).toFixed(0)}% do lucro líquido do mês.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
