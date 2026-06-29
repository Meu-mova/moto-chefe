'use client'
import { useTransition } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { atualizarStatusOSAction } from '../../actions'
import { toast } from 'sonner'

const STEPS = [
  { key: 'aberta',       label: 'Aberta' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'concluida',    label: 'Concluída' },
]

type Props = { osId: string; status: string; podeEditar: boolean }

export function OSStatusBar({ osId, status, podeEditar }: Props) {
  const [pending, start] = useTransition()
  const currentIdx = STEPS.findIndex(s => s.key === status)

  function avancar() {
    const next = STEPS[currentIdx + 1]
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
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx
        const current = idx === currentIdx
        const isLast  = idx === STEPS.length - 1

        return (
          <div key={step.key} className="flex items-center flex-1">
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
              <span className={`text-xs font-medium mt-1 ${
                current ? 'text-blue-700' : done ? 'text-green-700' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
            {!isLast && <div className={`h-px w-3 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />}
          </div>
        )
      })}

      {podeEditar && currentIdx < STEPS.length - 1 && (
        <button
          onClick={avancar}
          disabled={pending}
          className="ml-4 px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {pending ? 'Salvando…' : `→ ${STEPS[currentIdx + 1]?.label}`}
        </button>
      )}
    </div>
  )
}
