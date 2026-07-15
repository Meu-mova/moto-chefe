import type { StatusConc } from '@/lib/conciliacao-status'

const BADGE: Record<StatusConc, { label: string; cls: string } | null> = {
  na:          null,
  pendente:    { label: 'Pendente',   cls: 'bg-red-50 text-red-700 border-red-200' },
  parcial:     { label: 'Parcial',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  conciliada:  { label: '✓ OK',       cls: 'bg-green-50 text-green-700 border-green-200' },
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
