'use client'
import { useTransition } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, User, Wrench, Check, X, FileText, ExternalLink } from 'lucide-react'
import { confirmarAgendamentoAction, cancelarAgendamentoAction } from '../actions'
import { VirarOSDialog } from './virar-os-dialog'
import { toast } from 'sonner'
import Link from 'next/link'
import type { AgendamentoComDetalhes } from '@/lib/queries/agendamentos'

const statusCor: Record<string, string> = {
  pendente:   'border-l-amber-400 bg-warning/10',
  confirmado: 'border-l-blue-400 bg-info/10',
  concluido:  'border-l-green-400 bg-success/10',
  cancelado:  'border-l-slate-300 bg-muted opacity-60',
}
const statusBadge: Record<string, string> = {
  pendente:   'bg-warning/10 text-warning',
  confirmado: 'bg-info/10 text-info',
  concluido:  'bg-success/10 text-success',
  cancelado:  'bg-muted text-muted-foreground',
}
const statusLabel: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado',
}

type Props = {
  ag: AgendamentoComDetalhes
  podeGerenciar: boolean
  mecanicos: { id: string; nome: string }[]
}

export function AgendamentoCard({ ag, podeGerenciar, mecanicos }: Props) {
  const [pending, start] = useTransition()
  const hora = format(new Date(ag.dataHoraInicio), 'HH:mm')
  const mins = ag.duracaoMinutos

  function confirmar() {
    start(async () => {
      try { await confirmarAgendamentoAction(ag.id); toast.success('Confirmado') }
      catch (e: any) { toast.error(e.message) }
    })
  }

  function cancelar() {
    if (!confirm('Cancelar este agendamento?')) return
    start(async () => {
      try { await cancelarAgendamentoAction(ag.id); toast.success('Cancelado') }
      catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className={`border border-l-4 rounded-lg p-3 transition-all ${statusCor[ag.status] ?? 'bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Horário + duração */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-foreground">{hora}</span>
            <span className="text-xs text-muted-foreground">{mins < 60 ? `${mins}min` : `${mins/60}h`}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[ag.status] ?? ''}`}>
              {statusLabel[ag.status] ?? ag.status}
            </span>
          </div>

          {/* Cliente */}
          <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
            <User size={12} className="text-muted-foreground shrink-0" />
            {ag.clienteNome}
            <span className="font-normal text-muted-foreground">{ag.clienteFone}</span>
          </p>

          {/* Serviço */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Wrench size={11} className="text-muted-foreground shrink-0" />
            {ag.tipoServico}
            {ag.descricaoCliente && <span className="text-muted-foreground">· {ag.descricaoCliente}</span>}
          </p>

          {/* Mecânico */}
          {ag.mecanicoNome && (
            <p className="text-xs text-muted-foreground mt-0.5">{ag.mecanicoNome}</p>
          )}

          {/* OS vinculada */}
          {ag.osId && ag.osNumero && (
            <Link href={`/ordens-servico/${ag.osId}`}
              className="inline-flex items-center gap-1 text-xs text-info hover:underline mt-1">
              <FileText size={11} /> OS #{ag.osNumero} <ExternalLink size={10} />
            </Link>
          )}
        </div>

        {/* Ações */}
        {podeGerenciar && ag.status !== 'cancelado' && ag.status !== 'concluido' && (
          <div className="flex flex-col gap-1 shrink-0">
            {ag.status === 'pendente' && (
              <button onClick={confirmar} disabled={pending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
                <Check size={11} /> Confirmar
              </button>
            )}
            {!ag.osId && (
              <VirarOSDialog
                agendamentoId={ag.id}
                clienteNome={ag.clienteNome}
                clienteFone={ag.clienteFone}
                mecanicoId={ag.mecanicoId}
                descricao={ag.descricaoCliente || ag.tipoServico}
                mecanicos={mecanicos}
                disabled={pending}
              />
            )}
            <button onClick={cancelar} disabled={pending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50">
              <X size={11} /> Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
