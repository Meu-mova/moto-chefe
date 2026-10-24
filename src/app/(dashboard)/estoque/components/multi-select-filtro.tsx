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
          'flex w-full items-center justify-between gap-2 h-9 px-3 rounded-md border text-sm whitespace-nowrap',
          ativo
            ? 'border-foreground bg-muted text-foreground font-medium'
            : 'border-input bg-card text-muted-foreground hover:border-ring'
        )}
      >
        <span>{label}</span>
        <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
      </button>

      {aberto && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full bg-popover text-popover-foreground border border-border rounded-md shadow-lg">
          {comBusca && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={13} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="py-1 max-h-56 overflow-y-auto">
            {opcoesFiltradas.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</p>
            ) : opcoesFiltradas.map(o => {
              const sel = selecionados.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-muted text-left text-foreground"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    sel ? 'bg-primary border-primary' : 'border-input'
                  )}>
                    {sel && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
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
