// src/app/(dashboard)/estoque/[id]/components/historico-tab.tsx
import { buscarHistoricoMoto } from '@/lib/queries/motos'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const tipoLabel: Record<string, string> = {
  entrada:                'Entrada',
  saida:                  'Saída',
  transferencia_enviada:  'Transferência enviada',
  transferencia_recebida: 'Transferência recebida',
  mudanca_status:         'Mudança de status',
}

export async function HistoricoTab({ motoId }: { motoId: string }) {
  const historico = await buscarHistoricoMoto(motoId)

  return (
    <div className="space-y-3">
      {historico.map(h => (
        <div key={h.id} className="flex items-start justify-between p-3 border rounded-lg">
          <div>
            <p className="text-sm font-medium">{tipoLabel[h.tipo] ?? h.tipo}</p>
            {h.statusAnterior && h.statusNovo && (
              <p className="text-xs text-slate-500">
                {h.statusAnterior} → {h.statusNovo}
              </p>
            )}
            {h.observacao && <p className="text-xs text-slate-400 mt-1">{h.observacao}</p>}
            <p className="text-xs text-slate-400">por {h.usuarioNome}</p>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {h.data ? format(new Date(h.data), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}
          </span>
        </div>
      ))}
      {historico.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhum registro no histórico.</p>
      )}
    </div>
  )
}
