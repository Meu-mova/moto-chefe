// src/app/(dashboard)/estoque/components/status-cards.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { contarPorStatus } from '@/lib/queries/motos'

const statusConfig = {
  faturada:    { label: 'Faturadas',   color: 'text-slate-600' },
  montada:     { label: 'Montadas',    color: 'text-blue-600' },
  disponivel:  { label: 'Disponíveis', color: 'text-green-600' },
  reservada:   { label: 'Reservadas',  color: 'text-yellow-600' },
  em_garantia: { label: 'Em Garantia', color: 'text-orange-600' },
  vendida:     { label: 'Vendidas',    color: 'text-slate-400' },
}

export async function StatusCards() {
  const counts = await contarPorStatus()
  const countMap = Object.fromEntries(counts.map(c => [c.status, c.total]))

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
      {Object.entries(statusConfig).map(([status, { label, color }]) => (
        <Card key={status}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className={`text-xs font-medium ${color}`}>{label}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${color}`}>{countMap[status] ?? 0}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
