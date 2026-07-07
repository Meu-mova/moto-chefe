'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'

const STATUS_OPTS = [
  { value: 'aberta',       label: 'Aberta' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida',    label: 'Concluída' },
]

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-slate-800 text-white border-slate-800'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  )
}

export function OSFiltros() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const status = searchParams.get('status')?.split(',').filter(Boolean) ?? []
  const busca  = searchParams.get('q') ?? ''

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])

  function toggleMulti(key: string, current: string[], val: string) {
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val]
    update(key, next.join(','))
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Buscar OS, chassi, cliente, placa..."
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-8 text-sm w-64"
      />
      <div className="flex gap-1.5">
        {STATUS_OPTS.map(o => (
          <ToggleChip
            key={o.value}
            label={o.label}
            active={status.includes(o.value)}
            onClick={() => toggleMulti('status', status, o.value)}
          />
        ))}
      </div>
    </div>
  )
}
