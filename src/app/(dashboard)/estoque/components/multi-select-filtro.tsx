'use client'
import { useRef, useState, useEffect } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OpcaoFiltro = { value: string; label: string }

type Props = {
  placeholder: string
  opcoes: OpcaoFiltro[]
  selecionados: string[]
  onChange: (valores: string[]) => void
  className?: string
  comBusca?: boolean
}

export function MultiSelectFiltro({ placeholder, opcoes, selecionados, onChange, className, comBusca }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (aberto) {
      setBusca('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [aberto])

  function toggle(value: string) {
    if (selecionados.includes(value)) {
      onChange(selecionados.filter(v => v !== value))
    } else {
      onChange([...selecionados, value])
    }
  }

  const label =
    selecionados.length === 0
      ? placeholder
      : selecionados.length === 1
        ? (opcoes.find(o => o.value === selecionados[0])?.label ?? selecionados[0])
        : `${selecionados.length} selecionados`

  const ativo = selecionados.length > 0

  const opcoesFiltradas = comBusca && busca.trim()
    ? opcoes.filter(o => o.label.toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className={cn(
          'flex items-center justify-between gap-2 h-9 px-3 rounded-md border text-sm whitespace-nowrap',
          ativo
            ? 'border-slate-700 bg-slate-100 text-slate-800 font-medium'
            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
        )}
      >
        <span>{label}</span>
        <ChevronDown size={13} className="shrink-0 text-slate-400" />
      </button>

      {aberto && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full bg-white border border-slate-200 rounded-md shadow-lg">
          {comBusca && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
              />
            </div>
          )}
          <div className="py-1 max-h-56 overflow-y-auto">
            {opcoesFiltradas.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Nenhum resultado</p>
            ) : opcoesFiltradas.map(o => {
              const sel = selecionados.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-slate-50 text-left text-slate-700"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    sel ? 'bg-slate-800 border-slate-800' : 'border-slate-300'
                  )}>
                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                  </span>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
