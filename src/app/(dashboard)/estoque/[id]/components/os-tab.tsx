import { listarOSPorMoto } from '@/lib/queries/ordens-servico'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

const statusCor: Record<string, string> = {
  aberta:              'bg-amber-100 text-amber-700',
  oficina:             'bg-sky-100 text-sky-700',
  em_andamento:        'bg-blue-100 text-blue-700',
  finalizada:          'bg-indigo-100 text-indigo-700',
  pendente_pagamento:  'bg-orange-100 text-orange-700',
  concluida:           'bg-green-100 text-green-700',
  cancelada:           'bg-slate-100 text-slate-500',
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
          className="block p-3 border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-500">OS #{os.numero}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCor[os.status] ?? 'bg-slate-100 text-slate-500'}`}>
                  {statusLabel[os.status] ?? os.status}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-800 truncate">{os.descricao}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {os.dataAbertura ? format(new Date(os.dataAbertura), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                {os.mecanicoNome ? ` · ${os.mecanicoNome}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {os.valorTotal && parseFloat(os.valorTotal) > 0 && (
                <span className="text-sm font-bold text-green-700">
                  {parseFloat(os.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
              <ExternalLink size={13} className="text-slate-300" />
            </div>
          </div>
        </Link>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma OS para esta moto.</p>
      )}
    </div>
  )
}
