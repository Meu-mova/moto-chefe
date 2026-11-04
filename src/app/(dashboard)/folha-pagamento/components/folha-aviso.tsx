import { Info } from 'lucide-react'

// Aviso de "esta aba ignora um filtro": o da casca (acima do conteúdo) e o do cartão da Premiação.
export function AvisoFolha({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-[72ch] gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <span>{children}</span>
    </p>
  )
}
