'use client'
import { useTransition } from 'react'
import { ArrowRight, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { atualizarStatusOSAction } from '../../actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RESPONSAVEL_TRANSICAO, podeAvancarOS } from '@/lib/os-transicao'

const STEPS = [
  { key: 'aberta',              label: 'Aberta' },
  { key: 'oficina',              label: 'Oficina' },
  { key: 'em_andamento',        label: 'Em Andamento' },
  { key: 'finalizada',          label: 'Finalizada' },
  // Na barra horizontal o nome inteiro não cabe na caixa: lá sai o curto.
  { key: 'pendente_pagamento',  label: 'Pendente de Pagamento', curto: 'Pagamento' },
  { key: 'concluida',           label: 'Concluída' },
] as const satisfies readonly { key: string; label: string; curto?: string }[]

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
        const r = await atualizarStatusOSAction(osId, next.key)
        if (!r.ok) { toast.error(r.erro); return }
        toast.success(`Status atualizado: ${next.label}`)
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  const botao = (cls: string) => (
    <button
      type="button"
      onClick={avancar}
      disabled={pending}
      className={cn('rounded-lg bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50', cls)}
    >
      {pending ? 'Salvando…' : <span className="inline-flex items-center justify-center gap-1.5"><ArrowRight className="size-4" aria-hidden />{next?.label}</span>}
    </button>
  )
  const mostrarAvancar = Boolean(next && !ehUltimaAutomatica && podeAvancar)
  const aguardando = next && !ehUltimaAutomatica && !podeAvancar
    ? `Aguardando ${RESPONSAVEL_LABEL[responsaveis?.[0] ?? ''] ?? 'responsável'}`
    : ehUltimaAutomatica ? 'Aguardando pagamento' : null

  return (
    <>
      {/* Até o desktop, o botão de avançar fica fixo no rodapé (#248): no tablet a barra horizontal não tem espaço para ele. */}
      <ol className="space-y-1 rounded-xl border border-border bg-card p-3 md:hidden" aria-label="Etapas da OS">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx
          const current = idx === currentIdx
          return (
            <li key={step.key} className="flex items-center gap-3 py-1 text-sm">
              <span className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium',
                done ? 'bg-primary text-primary-foreground' : current ? 'bg-primary-soft text-primary-text ring-2 ring-primary' : 'bg-muted text-muted-foreground ring-1 ring-border',
              )}>
                {done ? <CheckCircle2 className="size-4" /> : current && pending ? <Loader2 className="size-4 animate-spin" /> : idx + 1}
              </span>
              <span className={cn(current ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}{current && <span className="sr-only"> (atual)</span>}
              </span>
            </li>
          )
        })}
        {aguardando && <li className="pt-1 text-xs text-muted-foreground">{aguardando}</li>}
      </ol>
      {mostrarAvancar && (
        <div data-barra-fixa className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          {botao('h-11 w-full')}
        </div>
      )}

      <div className="hidden items-center gap-0 md:flex">
        {STEPS.map((step, idx) => {
          const done    = idx < currentIdx
          const current = idx === currentIdx
          const isLast  = idx === STEPS.length - 1
          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-center">
              <div className={cn(
                'flex h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-lg border px-2 transition-colors',
                current ? 'border-primary bg-primary-soft' : done ? 'border-border bg-card' : 'border-border bg-muted',
              )}>
                {done
                  ? <CheckCircle2 size={18} className="text-primary" />
                  : current && pending
                    ? <Loader2 size={18} className="animate-spin text-primary" />
                    : <Circle size={18} className={current ? 'text-primary' : 'text-muted-foreground'} />}
                <span title={step.label} className={cn('mt-1 max-w-full truncate text-center text-xs font-medium', current ? 'text-primary-text' : done ? 'text-foreground' : 'text-muted-foreground')}>
                  {'curto' in step ? step.curto : step.label}
                </span>
              </div>
              {!isLast && <div className={cn('h-px w-3', done ? 'bg-primary' : 'bg-border')} />}
            </div>
          )
        })}
        {mostrarAvancar && <div className="ml-4 hidden lg:block">{botao('h-10')}</div>}
        {aguardando && <span className="ml-4 hidden text-xs whitespace-nowrap text-muted-foreground lg:inline">{aguardando}</span>}
      </div>
      {aguardando && <p className="hidden text-xs text-muted-foreground md:block lg:hidden">{aguardando}</p>}
    </>
  )
}
