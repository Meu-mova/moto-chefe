const TOM_KPI = {
  aviso:  'bg-warning/10 text-warning',
  perigo: 'bg-destructive/10 text-destructive',
  ok:     'bg-primary-soft text-primary-text',
  neutro: 'border border-border bg-card text-foreground',
}

/**
 * Card de número do topo das listas (Vendas, Peças). No celular os cards formam uma faixa que rola
 * para o lado (o pai usa flex + overflow-x); do desktop para cima, grade.
 */
export function Kpi({ tom, titulo, valor, nota }: { tom: keyof typeof TOM_KPI; titulo: string; valor: React.ReactNode; nota?: string }) {
  return (
    <div className={`min-w-40 shrink-0 snap-start rounded-lg px-4 py-3 lg:min-w-0 ${TOM_KPI[tom]}`}>
      <p className="text-xs font-medium tracking-wide uppercase opacity-80">{titulo}</p>
      <p className="mt-0.5 text-2xl font-bold">{valor}</p>
      {nota && <p className="mt-0.5 text-xs opacity-80">{nota}</p>}
    </div>
  )
}
