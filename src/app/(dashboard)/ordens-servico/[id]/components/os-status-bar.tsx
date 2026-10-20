'use client'
import { useTransition } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { atualizarStatusOSAction } from '../../actions'
import { toast } from 'sonner'
import { RESPONSAVEL_TRANSICAO, podeAvancarOS } from '@/lib/os-transicao'

const STEPS = [
  { key: 'aberta',              label: 'Aberta' },
  { key: 'oficina',              label: 'Oficina' },
  { key: 'em_andamento',        label: 'Em Andamento' },
  { key: 'finalizada',          label: 'Finalizada' },
  { key: 'pendente_pagamento',  label: 'Pendente de Pagamento' },
  { key: 'concluida',           label: 'Concluída' },
]

const RESPONSAVEL_LABEL: Record<string, string> = {
  mecanico: 'mecânico',
  admin_geral: 'admin', admin_socio: 'admin', aux_adm: 'admin',
}

type Props = { osId: string; status: string; podeEditar: boolean; papel: string }

export function OSStatusBar({ osId, status, podeEditar, papel }: Props) {
  const [pending, start] = useTransition()
  const currentIdx = STEPS.findIndex(s => s.key === status)
  const next = STEPS[currentIdx + 1]

  const responsaveis = next ? RESPONSAVEL_TRANSICAO[next.key] : undefined
  const ehUltimaAutomatica = next?.key === 'concluida'
  const podeAvancar = podeEditar && !!next && !ehUltimaAutomatica && podeAvancarOS(next.key, papel)

  function avancar() {
    if (!next) return
    start(async () => {
      try {
        await atualizarStatusOSAction(osId, next.key)
        toast.success(`Status atualizado: ${next.label}`)
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx
        const current = idx === currentIdx
        const isLast  = idx === STEPS.length - 1

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-[110px]">
            <div className={`flex flex-col items-center flex-1 py-3 px-2 rounded-lg border transition-colors ${
              current ? 'bg-blue-50 border-blue-300' :
              done    ? 'bg-green-50 border-green-200' :
                        'bg-slate-50 border-slate-100'
            }`}>
              {done
                ? <CheckCircle2 size={18} className="text-green-500" />
                : current && pending
                  ? <Loader2 size={18} className="text-blue-500 animate-spin" />
                  : <Circle size={18} className={current ? 'text-blue-500' : 'text-slate-300'} />
              }
              <span className={`text-xs font-medium mt-1 text-center ${
                current ? 'text-blue-700' : done ? 'text-green-700' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
            {!isLast && <div className={`h-px w-3 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />}
          </div>
        )
      })}

      {next && !ehUltimaAutomatica && (
        podeAvancar ? (
          <button
            onClick={avancar}
            disabled={pending}
            className="ml-4 px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {pending ? 'Salvando…' : `→ ${next.label}`}
          </button>
        ) : (
          <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
            Aguardando {RESPONSAVEL_LABEL[responsaveis?.[0] ?? ''] ?? 'responsável'}
          </span>
        )
      )}

      {ehUltimaAutomatica && (
        <span className="ml-4 text-xs text-slate-400 whitespace-nowrap">
          Aguardando pagamento
        </span>
      )}
    </div>
  )
}
