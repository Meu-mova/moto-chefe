// Cartão de um detalhe da folha: título pequeno, valor opcional à direita e o conteúdo embaixo.
export function Bloco({ titulo, valor, valorClasse = '', className = '', children }: {
  titulo: string
  valor?: React.ReactNode
  /** Esconde o valor do topo onde a coluna dele já aparece na linha. */
  valorClasse?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-lg border bg-card px-3 py-2.5 ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold text-muted-foreground">{titulo}</p>
        {valor !== undefined && <b className={`shrink-0 whitespace-nowrap tabular-nums ${valorClasse}`}>{valor}</b>}
      </div>
      {children}
    </section>
  )
}
