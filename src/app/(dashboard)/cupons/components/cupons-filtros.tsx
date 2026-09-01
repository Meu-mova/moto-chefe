'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'

const STATUS = [
  { value: '',          label: 'Todos' },
  { value: 'ativo',     label: 'Ativos' },
  { value: 'usado',     label: 'Utilizados' },
  { value: 'vencido',   label: 'Vencidos' },
  { value: 'cancelado', label: 'Cancelados' },
]

export function CuponsFiltros() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const busca = searchParams.get('q') ?? ''

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Código, cliente ou chassi…"
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-8 text-sm w-64"
      />
      <div className="flex gap-1.5">
        {STATUS.map(o => (
          <button
            key={o.value}
            onClick={() => update('status', o.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              status === o.value
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
