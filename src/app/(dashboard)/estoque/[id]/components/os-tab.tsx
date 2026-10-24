import { listarOSPorMoto } from '@/lib/queries/ordens-servico'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

const statusCor: Record<string, string> = {
  aberta:              'bg-warning/15 text-warning',
  oficina:             'bg-info/15 text-info',
  em_andamento:        'bg-info/15 text-info',
  finalizada:          'bg-info/15 text-info',
  pendente_pagamento:  'bg-warning/15 text-warning',
  concluida:           'bg-success/15 text-success',
  cancelada:           'bg-muted text-muted-foreground',
}
const statusLabel: Record<string, string> = {
  aberta: 'Aberta', oficina: 'Oficina', em_andamento: 'Em Andamento',
  finalizada: 'Finalizada', pendente_pagamento: 'Pendente de Pagamento', concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export async function OSTab({ motoId }: { motoId: string }) {
  const lista = await listarOSPorMoto(motoId)
  return (
    <div className="space-y-3">
      {lista.map(os => (
        <Link key={os.id} href={`/ordens-servico/${os.id}`}
          className="block p-3 border border-border rounded-lg hover:border-ring hover:shadow-sm transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-muted-foreground">OS #{os.numero}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCor[os.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {statusLabel[os.status] ?? os.status}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{os.descricao}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {os.dataAbertura ? format(new Date(os.dataAbertura), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                {os.mecanicoNome ? ` · ${os.mecanicoNome}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {os.valorTotal && parseFloat(os.valorTotal) > 0 && (
                <span className="text-sm font-bold text-success">
                  {parseFloat(os.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
              <ExternalLink size={13} className="text-muted-foreground" />
            </div>
          </div>
        </Link>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma OS para esta moto.</p>
      )}
    </div>
  )
}
