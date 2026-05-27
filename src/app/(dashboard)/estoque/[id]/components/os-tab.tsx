import { listarOSPorMoto } from '@/lib/queries/ordens-servico'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusLabel: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
}

export async function OSTab({ motoId }: { motoId: string }) {
  const lista = await listarOSPorMoto(motoId)
  return (
    <div className="space-y-3">
      {lista.map(os => (
        <div key={os.id} className="p-3 border rounded-lg space-y-1">
          <div className="flex justify-between">
            <p className="text-sm font-medium">{os.descricao}</p>
            <Badge variant={os.status === 'concluida' ? 'secondary' : 'default'}>
              {statusLabel[os.status] ?? os.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Aberta por {os.abertaPorNome} em {os.dataAbertura ? format(new Date(os.dataAbertura), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
          </p>
          {os.dataConclusao && (
            <p className="text-xs text-slate-400">
              Concluída em {format(new Date(os.dataConclusao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
            </p>
          )}
        </div>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma OS para esta moto.</p>
      )}
    </div>
  )
}
