'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { CalendarRange } from 'lucide-react'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'

type Props = {
  lojas: { id: string; nome: string }[]
  mecanicos: { id: string; nome: string }[]
  dataInicioInicial: string
  dataFimInicial: string
}

export function MontagensFiltros({ lojas, mecanicos, dataInicioInicial, dataFimInicial }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const lojaSel = searchParams.get('loja')?.split(',').filter(Boolean) ?? []
  const mecanico = searchParams.get('mecanico') ?? ''

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <CalendarRange size={15} className="text-muted-foreground" />
        <input
          type="date"
          defaultValue={dataInicioInicial}
          onChange={e => update('de', e.target.value)}
          className="h-8 rounded-md border px-2 text-sm"
        />
        <span className="text-muted-foreground text-sm">até</span>
        <input
          type="date"
          defaultValue={dataFimInicial}
          onChange={e => update('ate', e.target.value)}
          className="h-8 rounded-md border px-2 text-sm"
        />
      </div>

      {lojas.length > 1 && (
        <MultiSelectFiltro
          placeholder="Loja"
          opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
          selecionados={lojaSel}
          onChange={v => update('loja', v.join(','))}
          className="min-w-[11rem]"
        />
      )}

      {/* Um mecânico por vez: este filtro recorta a LISTA de motos, não o total
          por mecânico — a tabela de cima continua mostrando todos. */}
      <select
        value={mecanico}
        onChange={e => update('mecanico', e.target.value)}
        className="h-8 rounded-md border px-2 text-sm"
      >
        <option value="">Todos os mecânicos</option>
        {mecanicos.map(m => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>
    </div>
  )
}
