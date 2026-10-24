'use client'

export default function MotoDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <p className="text-muted-foreground">Erro ao carregar os dados da moto.</p>
      <button
        onClick={reset}
        className="text-sm text-info underline"
      >
        Tentar novamente
      </button>
    </div>
  )
}
