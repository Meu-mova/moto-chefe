'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'
import { STATUS_OS } from '../status-os'

type Props = {
  lojas: { id: string; nome: string }[]
  mecanicos: { id: string; nome: string }[]
  dataInicioInicial: string
  dataFimInicial: string
  /** Quantas OS de cada status há no recorte, para o número no botão. */
  contagem: Record<string, number>
}

/**
 * Padrão de Vendas (#248). O status vira botões que filtram (no lugar das seções por status) e
 * ficam sempre à vista, rolando para o lado no celular. A busca também fica à vista; loja,
 * mecânico e período vão para a gaveta "Filtros" abaixo do desktop.
 */
export function OSFiltros({ lojas, mecanicos, dataInicioInicial, dataFimInicial, contagem }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [gaveta, setGaveta] = useState(false)

  const status  = searchParams.get('status')?.split(',').filter(Boolean) ?? []
  const busca   = searchParams.get('q') ?? ''
  const lojaSel = searchParams.get('loja')?.split(',').filter(Boolean) ?? []
  const mecSel  = searchParams.get('mecanico')?.split(',').filter(Boolean) ?? []
  const ativos  = (lojaSel.length ? 1 : 0) + (mecSel.length ? 1 : 0) + (searchParams.get('de') || searchParams.get('ate') ? 1 : 0)
  const temFiltro = Boolean(busca) || status.length > 0 || ativos > 0

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])
  const limpar = () => router.replace('?')

  function toggleStatus(val: string) {
    const next = status.includes(val) ? status.filter(v => v !== val) : [...status, val]
    update('status', next.join(','))
  }

  const buscaInput = (largura: string) => (
    <div className={`relative ${largura}`}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar OS, chassi, cliente..."
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-10 pl-8 md:text-base lg:h-9 lg:text-sm"
      />
    </div>
  )
  const filtroLoja = lojas.length > 0 && (
    <MultiSelectFiltro
      placeholder="Loja"
      opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
      selecionados={lojaSel}
      onChange={v => update('loja', v.join(','))}
      className="w-full lg:w-auto lg:min-w-[11rem]"
    />
  )
  const filtroMecanico = mecanicos.length > 0 && (
    <MultiSelectFiltro
      placeholder="Mecânico"
      opcoes={mecanicos.map(m => ({ value: m.id, label: m.nome }))}
      selecionados={mecSel}
      onChange={v => update('mecanico', v.join(','))}
      className="w-full lg:w-auto lg:min-w-[11rem]"
    />
  )
  const periodo = (
    <div className="flex items-center gap-1.5">
      <Input type="date" defaultValue={dataInicioInicial} onChange={e => update('de', e.target.value)}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm" />
      <span className="text-xs text-muted-foreground">até</span>
      <Input type="date" defaultValue={dataFimInicial} onChange={e => update('ate', e.target.value)}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm" />
    </div>
  )
  const chip = (ativo: boolean) => cn(
    'h-9 shrink-0 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors lg:h-8 lg:text-xs',
    ativo ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2 lg:hidden">
        {buscaInput('min-w-0 flex-1')}
        <Button type="button" variant="outline" onClick={() => setGaveta(true)} className="h-10 gap-1.5">
          <Filter className="size-4" /> Filtros
          {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{ativos}</span>}
        </Button>
      </div>

      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          <SheetTitle className="mb-3 text-base">Filtros</SheetTitle>
          <div className="space-y-3">
            {filtroLoja}
            {filtroMecanico}
            <div>
              <p className="mb-1 text-sm font-medium">Período de abertura</p>
              {periodo}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={limpar} className="h-11 flex-1 border-input">Limpar</Button>
              <Button type="button" onClick={() => setGaveta(false)} className="h-11 flex-1">Ver ordens</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        {buscaInput('w-64')}
        {filtroLoja}
        {filtroMecanico}
        {periodo}
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <X size={13} /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Status: sempre à vista. Celular rola para o lado; desktop quebra linha. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar por status">
        <button type="button" onClick={() => update('status', '')} aria-pressed={status.length === 0} className={chip(status.length === 0)}>
          Todas
        </button>
        {STATUS_OS.map(o => (
          <button key={o.value} type="button" onClick={() => toggleStatus(o.value)} aria-pressed={status.includes(o.value)} className={chip(status.includes(o.value))}>
            {o.curto}{contagem[o.value] ? ` (${contagem[o.value]})` : ''}
          </button>
        ))}
      </div>
    </div>
  )
}
