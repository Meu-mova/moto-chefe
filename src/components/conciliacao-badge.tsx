import type { StatusConc } from '@/lib/conciliacao-status'

const BADGE: Record<StatusConc, { label: string; cls: string } | null> = {
  na:          null,
  pendente:    { label: 'Pendente',   cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  parcial:     { label: 'Parcial',    cls: 'bg-warning/10 text-warning border-warning/30' },
  conciliada:  { label: '✓ OK',       cls: 'bg-success/10 text-success border-success/30' },
}

export function ConcBadge({ status }: { status: StatusConc }) {
  const b = BADGE[status]
  if (!b) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${b.cls}`}>
      {b.label}
    </span>
  )
}
