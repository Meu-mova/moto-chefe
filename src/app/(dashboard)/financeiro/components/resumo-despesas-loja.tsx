import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  /** lojaId → total. A chave null junta o que não tem loja atribuída. */
  porLoja: Map<string | null, number>
  lojas: { id: string; nome: string }[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoDespesasPorLoja({ porLoja, lojas }: Props) {
  const nomePorId = new Map(lojas.map(l => [l.id, l.nome]))

  const linhas = [...porLoja.entries()]
    .map(([lojaId, total]) => ({
      chave: lojaId ?? '__geral',
      nome: lojaId ? (nomePorId.get(lojaId) ?? 'Loja removida') : 'Geral (Empresa)',
      semLoja: lojaId === null,
      total,
    }))
    .filter(l => l.total > 0)
    .sort((a, b) => b.total - a.total)

  const total = linhas.reduce((s, l) => s + l.total, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Despesas por Loja</CardTitle>
        <p className="text-xs text-muted-foreground">
          valor como foi registrado, sem rateio da despesa geral
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {linhas.map(l => (
            <div key={l.chave} className="flex items-baseline justify-between gap-3 text-sm">
              <span className={l.semLoja ? 'text-muted-foreground italic' : ''}>{l.nome}</span>
              <span className="font-mono text-destructive whitespace-nowrap">
                {fmt(l.total)}
                {total > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {((l.total / total) * 100).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          ))}
          {linhas.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma despesa no período.</p>
          )}
        </div>

        {linhas.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-sm border-t mt-2 pt-2 font-semibold">
            <span>Total</span>
            <span className="font-mono text-destructive">{fmt(total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
