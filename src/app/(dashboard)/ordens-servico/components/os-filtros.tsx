'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { CalendarRange } from 'lucide-react'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'

const STATUS_OPTS = [
  { value: 'aberta',              label: 'Aberta' },
  { value: 'oficina',             label: 'Oficina' },
  { value: 'em_andamento',        label: 'Em Andamento' },
  { value: 'finalizada',          label: 'Finalizada' },
  { value: 'pendente_pagamento',  label: 'Pendente de Pagamento' },
  { value: 'concluida',           label: 'Concluída' },
  { value: 'cancelada',           label: 'Cancelada' },
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

type Props = {
  lojas: { id: string; nome: string }[]
  mecanicos: { id: string; nome: string }[]
  dataInicioInicial: string
  dataFimInicial: string
}

export function OSFiltros({ lojas, mecanicos, dataInicioInicial, dataFimInicial }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const status = searchParams.get('status')?.split(',').filter(Boolean) ?? []
  const busca  = searchParams.get('q') ?? ''
  const lojaSel = searchParams.get('loja')?.split(',').filter(Boolean) ?? []
  const mecSel  = searchParams.get('mecanico')?.split(',').filter(Boolean) ?? []

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
        placeholder="Buscar OS, chassi, cliente..."
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-8 text-sm w-64"
      />

      {lojas.length > 0 && (
        <MultiSelectFiltro
          placeholder="Loja"
          opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
          selecionados={lojaSel}
          onChange={v => update('loja', v.join(','))}
          className="min-w-[11rem]"
        />
      )}

      {mecanicos.length > 0 && (
        <MultiSelectFiltro
          placeholder="Mecânico"
          opcoes={mecanicos.map(m => ({ value: m.id, label: m.nome }))}
          selecionados={mecSel}
          onChange={v => update('mecanico', v.join(','))}
          className="min-w-[11rem]"
        />
      )}

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

      <div className="flex items-center gap-1.5">
        <CalendarRange size={15} className="text-slate-400 shrink-0" />
        <Input
          type="date"
          defaultValue={dataInicioInicial}
          onChange={e => update('de', e.target.value)}
          className="h-8 text-sm w-36"
        />
        <span className="text-xs text-slate-400">até</span>
        <Input
          type="date"
          defaultValue={dataFimInicial}
          onChange={e => update('ate', e.target.value)}
          className="h-8 text-sm w-36"
        />
      </div>
    </div>
  )
}
