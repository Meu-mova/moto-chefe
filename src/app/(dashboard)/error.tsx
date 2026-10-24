'use client'

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h2 className="text-xl font-semibold text-foreground">Erro ao carregar a página</h2>
      <p className="text-muted-foreground text-sm max-w-md">
        Não foi possível carregar os dados. Tente novamente em alguns segundos.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary-hover"
      >
        Tentar novamente
      </button>
    </div>
  )
}
