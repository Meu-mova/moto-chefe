import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { CATEGORIA_META } from '@/lib/calendario'
import type { OcorrenciaCalendario } from '@/lib/queries/calendario'

export function ProximosEventosCard({ eventos }: { eventos: OcorrenciaCalendario[] }) {
  if (eventos.length === 0) return null

  return (
    <div className="bg-white border rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-1.5">
          <CalendarRange size={15} className="text-slate-500" />
          Próximos eventos
        </h2>
        <Link href="/calendario" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          Ver calendário <ArrowRight size={12} />
        </Link>
      </div>
      <ul className="divide-y">
        {eventos.slice(0, 6).map((e, i) => {
          const meta = CATEGORIA_META[e.categoria as keyof typeof CATEGORIA_META] ?? CATEGORIA_META.outro
          const d = new Date(`${e.data}T12:00:00Z`)
          return (
            <li key={`${e.id}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex flex-col items-center justify-center w-11 shrink-0">
                <span className="text-[10px] uppercase text-slate-400 leading-none">{format(d, 'MMM', { locale: ptBR })}</span>
                <span className="text-lg font-bold text-slate-700 leading-tight">{format(d, 'dd')}</span>
              </div>
              <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{e.titulo}</p>
                <p className="text-xs text-slate-400">
                  {meta.label}{e.hora ? ` · ${e.hora}` : ''}
                  {e.categoria !== 'aniversario' && `, ${format(d, "EEEE", { locale: ptBR })}`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
