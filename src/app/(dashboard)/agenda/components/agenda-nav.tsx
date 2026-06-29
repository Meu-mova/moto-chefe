'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { addDays, format, subDays, startOfWeek, endOfWeek, isSameDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, List } from 'lucide-react'

type Props = {
  data: Date
  modo: 'dia' | 'semana'
}

export function AgendaNav({ data, modo }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function navegar(novaData: Date) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('data', format(novaData, 'yyyy-MM-dd'))
    router.replace(`/agenda?${params}`)
  }

  function trocarModo(novoModo: 'dia' | 'semana') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('modo', novoModo)
    router.replace(`/agenda?${params}`)
  }

  function hoje() {
    const params = new URLSearchParams(searchParams.toString())
    params.set('data', format(new Date(), 'yyyy-MM-dd'))
    router.replace(`/agenda?${params}`)
  }

  const inicio = modo === 'semana' ? startOfWeek(data, { weekStartsOn: 1 }) : data
  const fim    = modo === 'semana' ? endOfWeek(data,   { weekStartsOn: 1 }) : data

  const titulo = modo === 'semana'
    ? `${format(inicio, 'dd MMM', { locale: ptBR })} – ${format(fim, 'dd MMM yyyy', { locale: ptBR })}`
    : format(data, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  // dias da semana para quick-pick
  const diasSemana = Array.from({ length: 7 }, (_, i) => addDays(inicio, i))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Anterior / Próximo */}
        <div className="flex items-center gap-1">
          <button onClick={() => navegar(modo === 'semana' ? subDays(data, 7) : subDays(data, 1))}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => navegar(modo === 'semana' ? addDays(data, 7) : addDays(data, 1))}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        <h2 className="text-base font-semibold text-slate-800 capitalize">{titulo}</h2>

        <button onClick={hoje}
          className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600">
          Hoje
        </button>

        {/* Toggle modo */}
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden ml-auto">
          <button onClick={() => trocarModo('dia')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              modo === 'dia' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}>
            <List size={13} /> Dia
          </button>
          <button onClick={() => trocarModo('semana')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              modo === 'semana' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}>
            <CalendarDays size={13} /> Semana
          </button>
        </div>
      </div>

      {/* Quick-pick dias da semana */}
      {modo === 'semana' && (
        <div className="grid grid-cols-7 gap-1">
          {diasSemana.map(dia => (
            <button key={dia.toISOString()} onClick={() => { navegar(dia); trocarModo('dia') }}
              className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors ${
                isToday(dia)
                  ? 'bg-blue-600 text-white font-bold'
                  : isSameDay(dia, data)
                    ? 'bg-slate-800 text-white'
                    : 'hover:bg-slate-100 text-slate-600'
              }`}>
              <span className="font-medium capitalize">{format(dia, 'EEE', { locale: ptBR })}</span>
              <span className="text-base font-bold">{format(dia, 'd')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
