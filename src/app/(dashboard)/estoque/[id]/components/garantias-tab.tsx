import { listarGarantiasPorMoto } from '@/lib/queries/garantias'
import { Badge } from '@/components/ui/badge'

export async function GarantiasTab({ motoId }: { motoId: string }) {
  const lista = await listarGarantiasPorMoto(motoId)
  return (
    <div className="space-y-3">
      {lista.map(g => (
        <div key={g.id} className="p-3 border rounded-lg space-y-1">
          <div className="flex justify-between">
            <p className="text-sm font-medium">{g.descricao}</p>
            <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
              {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">{g.dataInicio} → {g.dataFim}</p>
          {g.numeroPedidoFabrica && (
            <p className="text-xs text-slate-500">Pedido fábrica: {g.numeroPedidoFabrica}</p>
          )}
        </div>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma garantia para esta moto.</p>
      )}
    </div>
  )
}
