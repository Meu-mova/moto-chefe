import { X } from 'lucide-react'

/**
 * Painel de detalhe à direita da lista, só no desktop (lg+): o mesmo cartão do painel de Vendas
 * (flutua com a rolagem, canto arredondado, sombra) e o X que o fecha.
 */
export function PainelLateral({ legenda, onFechar, children }: { legenda: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <aside className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] w-96 shrink-0 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg lg:block" aria-label={legenda}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">{legenda}</p>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-5" />
        </button>
      </div>
      {children}
    </aside>
  )
}
