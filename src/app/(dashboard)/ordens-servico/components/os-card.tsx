'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Wrench, Car, ArrowRight, User, Clock } from 'lucide-react'
import type { OSComDetalhes } from '@/lib/queries/ordens-servico'
import { calcStatusPagamentoUnicoOS } from '@/lib/conciliacao-status'
import { ConcBadge } from '@/components/conciliacao-badge'

const statusColor: Record<string, string> = {
  aberta:              'bg-amber-100 text-amber-700 border-amber-200',
  oficina:             'bg-sky-100 text-sky-700 border-sky-200',
  em_andamento:        'bg-blue-100 text-blue-700 border-blue-200',
  finalizada:          'bg-indigo-100 text-indigo-700 border-indigo-200',
  pendente_pagamento:  'bg-orange-100 text-orange-700 border-orange-200',
  concluida:           'bg-green-100 text-green-700 border-green-200',
}
const statusLabel: Record<string, string> = {
  aberta: 'Aberta', oficina: 'Oficina', em_andamento: 'Em Andamento',
  finalizada: 'Finalizada', pendente_pagamento: 'Pendente de Pagamento', concluida: 'Concluída',
}
type Props = { os: OSComDetalhes; papel: string; lojaIdUsuario: string | null }

export function OSCard({ os }: Props) {
  const motoDesc = os.chassi
    ? `${os.marca ?? ''} ${os.modelo ?? ''} · ${os.chassi}`
    : `${os.marcaExterna ?? ''} ${os.modeloExterno ?? ''}`

  const clienteDesc = os.clienteNome ?? os.clienteNomeExterno ?? null

  const statusConc = calcStatusPagamentoUnicoOS(
    os.formaPagamento,
    os.valorTotal,
    os.conciliadoValor as number,
    os.pixConciliadoValor as number,
  )

  return (
    <Link href={`/ordens-servico/${os.id}`} className="block group">
      <Card className="hover:border-slate-400 transition-colors">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-800">OS #{os.numero ?? '—'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusColor[os.status] ?? ''}`}>
                  {statusLabel[os.status] ?? os.status}
                </span>
                <ConcBadge status={statusConc} />
              </div>

              {/* Moto */}
              <div className="flex items-center gap-1.5 text-sm text-slate-700">
                <Car size={13} className="text-slate-400 shrink-0" />
                <span className="font-medium truncate">{motoDesc.trim() || '—'}</span>
              </div>

              {/* Cliente */}
              {clienteDesc && (
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <span>{clienteDesc}</span>
                </div>
              )}

              {/* Descrição */}
              <p className="text-xs text-slate-500 line-clamp-1">{os.descricao}</p>

              {/* Footer */}
              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                <span>{os.lojaNome}</span>
                {os.mecanicoNome && (
                  <span className="flex items-center gap-1">
                    <Wrench size={11} /> {os.mecanicoNome}
                  </span>
                )}
                {os.dataPrevisao && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock size={11} /> Previsão: {format(new Date(os.dataPrevisao), 'dd/MM', { locale: ptBR })}
                  </span>
                )}
                <span>{format(new Date(os.dataAbertura), 'dd/MM/yyyy', { locale: ptBR })}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              {os.valorTotal && parseFloat(os.valorTotal) > 0 && (
                <span className="text-sm font-bold text-green-700">
                  {parseFloat(os.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
              <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
