import { X } from 'lucide-react'

/**
 * Painel de detalhe à direita da lista, só no desktop (lg+): o mesmo cartão do painel de Vendas
 * (flutua com a rolagem, canto arredondado, sombra) e o X que o fecha.
 */
export function PainelLateral({ legenda, onFechar, children }: { legenda: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <aside className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] w-96 shrink-0 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg lg:block" aria-label={legenda}>
      {/* X no canto do cartão (o aside é sticky, então já é o referencial do absolute); a legenda abre espaço para ele. */}
      <button type="button" onClick={onFechar} aria-label="Fechar" className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-5" />
      </button>
      <p className="min-w-0 pr-8 text-xs text-muted-foreground">{legenda}</p>
      {children}
    </aside>
  )
}
