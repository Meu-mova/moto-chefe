import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  porCategoriaGeral: { categoria: string; total: number }[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoDespesasGeral({ porCategoriaGeral }: Props) {
  const total = porCategoriaGeral.reduce((s, c) => s + c.total, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-500">Geral (Empresa) por Categoria</CardTitle>
        <p className="text-xs text-slate-400">
          despesas sem loja atribuída no Importar do Banco
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {porCategoriaGeral.map(c => (
            <div key={c.categoria} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{c.categoria}</span>
              <span className="font-mono text-red-600 whitespace-nowrap">
                {fmt(c.total)}
                {total > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {((c.total / total) * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          ))}
          {porCategoriaGeral.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">
              Nenhuma despesa sem loja atribuída no período.
            </p>
          )}
        </div>

        {porCategoriaGeral.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-sm border-t mt-2 pt-2 font-semibold">
            <span>Total</span>
            <span className="font-mono text-red-700">{fmt(total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
