import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  total: number
  porCategoria: { categoria: string; total: string }[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoDespesas({ total, porCategoria }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-500">Despesas Operacionais</CardTitle>
        <p className="text-2xl font-bold text-red-600">{fmt(total)}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {porCategoria.map(c => (
            <div key={c.categoria} className="flex justify-between text-sm">
              <span className="text-slate-600">{c.categoria}</span>
              <span className="font-mono text-slate-700">{fmt(Number(c.total))}</span>
            </div>
          ))}
          {porCategoria.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Sem despesas no período</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
