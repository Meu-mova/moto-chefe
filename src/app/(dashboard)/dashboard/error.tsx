'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h2 className="text-xl font-semibold text-foreground">Erro ao carregar o dashboard</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Não foi possível carregar os dados. Isso pode acontecer quando muitos usuários acessam ao mesmo tempo.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-foreground text-background rounded-md text-sm hover:bg-foreground/80"
      >
        Tentar novamente
      </button>
    </div>
  )
}
