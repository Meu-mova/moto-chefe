import { Package, Zap, XCircle, CheckCircle2 } from 'lucide-react'

export function MotoStatusIcon({ status }: { status: string }) {
  if (status === 'montada') {
    return (
      <span className="flex items-center gap-1 text-success font-medium text-sm">
        <Zap size={15} className="fill-success text-success" />
        Montada
      </span>
    )
  }
  if (status === 'em_garantia') {
    return (
      <span className="flex items-center gap-1 text-destructive font-medium text-sm">
        <XCircle size={15} className="fill-destructive/10" />
        Garantia
      </span>
    )
  }
  if (status === 'vendida') {
    return (
      <span className="flex items-center gap-1 text-primary-text font-medium text-sm">
        <CheckCircle2 size={15} className="text-primary-text" />
        Vendida
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm">
      <Package size={15} />
      Caixa
    </span>
  )
}
