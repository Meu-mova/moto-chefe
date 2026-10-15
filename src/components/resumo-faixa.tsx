import { cn } from '@/lib/utils'

export type ItemResumo = { rotulo: string; valor: string; nota: string; tom?: string }

/**
 * Resumo em faixa única, sem caixas. O primeiro item é o principal: no celular ele fica grande e os
 * demais em linha abaixo, separados por fio; do tablet para cima são colunas separadas por fio.
 * `acaoMobile` (opcional) fica no celular acima do fio, à direita.
 */
export function ResumoFaixa({ itens, acaoMobile }: { itens: ItemResumo[]; acaoMobile?: React.ReactNode }) {
  const [principal, ...resto] = itens
  return (
    <section>
      <div className="md:hidden">
        <p className="text-sm text-muted-foreground">{principal.rotulo}</p>
        <p className={cn('text-3xl font-bold tabular-nums', principal.tom)}>{principal.valor}</p>
        <p className="text-xs text-muted-foreground">{principal.nota}</p>
        <div className="relative mt-3">
          {acaoMobile && <div className="absolute bottom-2 right-0">{acaoMobile}</div>}
        </div>
        {/* Com 3+ itens secundários (sócio no PIX) as colunas ficam estreitas: valor em text-sm. */}
        <dl className="grid divide-x divide-border border-t border-border pt-3" style={{ gridTemplateColumns: `repeat(${resto.length}, minmax(0, 1fr))` }}>
          {resto.map((it, i) => (
            <div key={it.rotulo} className={cn('min-w-0', i ? 'pl-3' : 'pr-3')}>
              <dt className="text-xs text-muted-foreground">{it.rotulo}</dt>
              <dd className={cn('font-semibold tabular-nums', resto.length > 2 && 'text-sm', it.tom)}>{it.valor}</dd>
              <dd className="text-xs text-muted-foreground">{it.nota}</dd>
            </div>
          ))}
        </dl>
      </div>
      <dl className="hidden divide-x divide-border md:grid" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
        {itens.map((it, i) => (
          <div key={it.rotulo} className={cn('min-w-0', i ? 'pl-6' : 'pr-6')}>
            <dt className="text-sm text-muted-foreground">{it.rotulo}</dt>
            <dd className={cn('mt-1 text-2xl font-bold tabular-nums', it.tom)}>{it.valor}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{it.nota}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
