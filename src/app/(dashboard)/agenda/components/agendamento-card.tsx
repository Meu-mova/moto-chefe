'use client'
import { useTransition } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, User, Wrench, Check, X, FileText, ExternalLink } from 'lucide-react'
import { confirmarAgendamentoAction, cancelarAgendamentoAction, agendamentoVirarOSAction } from '../actions'
import { toast } from 'sonner'
import Link from 'next/link'
import type { AgendamentoComDetalhes } from '@/lib/queries/agendamentos'

const statusCor: Record<string, string> = {
  pendente:   'border-l-amber-400 bg-amber-50',
  confirmado: 'border-l-blue-400 bg-blue-50',
  concluido:  'border-l-green-400 bg-green-50',
  cancelado:  'border-l-slate-300 bg-slate-50 opacity-60',
}
const statusBadge: Record<string, string> = {
  pendente:   'bg-amber-100 text-amber-700',
  confirmado: 'bg-blue-100 text-blue-700',
  concluido:  'bg-green-100 text-green-700',
  cancelado:  'bg-slate-100 text-slate-500',
}
const statusLabel: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado',
}

type Props = {
  ag: AgendamentoComDetalhes
  podeGerenciar: boolean
}

export function AgendamentoCard({ ag, podeGerenciar }: Props) {
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

  async function virarOS() {
    start(async () => {
      try {
        const os = await agendamentoVirarOSAction(ag.id)
        toast.success(`OS #${os.numero} criada`)
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className={`border border-l-4 rounded-lg p-3 transition-all ${statusCor[ag.status] ?? 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Horário + duração */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-slate-800">{hora}</span>
            <span className="text-xs text-slate-400">{mins < 60 ? `${mins}min` : `${mins/60}h`}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[ag.status] ?? ''}`}>
              {statusLabel[ag.status] ?? ag.status}
            </span>
          </div>

          {/* Cliente */}
          <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
            <User size={12} className="text-slate-400 shrink-0" />
            {ag.clienteNome}
            <span className="font-normal text-slate-500">{ag.clienteFone}</span>
          </p>

          {/* Serviço */}
          <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
            <Wrench size={11} className="text-slate-400 shrink-0" />
            {ag.tipoServico}
            {ag.descricaoCliente && <span className="text-slate-400">· {ag.descricaoCliente}</span>}
          </p>

          {/* Mecânico */}
          {ag.mecanicoNome && (
            <p className="text-xs text-slate-500 mt-0.5">{ag.mecanicoNome}</p>
          )}

          {/* OS vinculada */}
          {ag.osId && ag.osNumero && (
            <Link href={`/ordens-servico/${ag.osId}`}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
              <FileText size={11} /> OS #{ag.osNumero} <ExternalLink size={10} />
            </Link>
          )}
        </div>

        {/* Ações */}
        {podeGerenciar && ag.status !== 'cancelado' && ag.status !== 'concluido' && (
          <div className="flex flex-col gap-1 shrink-0">
            {ag.status === 'pendente' && (
              <button onClick={confirmar} disabled={pending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <Check size={11} /> Confirmar
              </button>
            )}
            {!ag.osId && (
              <button onClick={virarOS} disabled={pending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50">
                <FileText size={11} /> Virar OS
              </button>
            )}
            <button onClick={cancelar} disabled={pending}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">
              <X size={11} /> Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
