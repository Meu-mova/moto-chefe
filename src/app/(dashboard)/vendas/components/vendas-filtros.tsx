'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'
import { Search, FileText, CalendarRange, Filter, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

type Loja      = { id: string; nome: string }
type Modelo    = { id: string; modelo: string }
type Vendedor  = { id: string; nome: string }

type Props = {
  lojas:             Loja[]
  modelos:           Modelo[]
  vendedores:        Vendedor[]
  lojaIdDefault:     string | null
  chassiInicial:     string
  nfInicial:         string
  dataInicioInicial: string
  dataFimInicial:    string
  podeConciliacao:   boolean
}

const CONC_OPCOES = [
  { value: 'pendente',   label: 'Pendente' },
  { value: 'parcial',    label: 'Parcial' },
  { value: 'conciliada', label: 'Conciliada' },
]

function parse(param: string | null): string[] {
  if (!param) return []
  return param.split(',').filter(Boolean)
}

function useDebounce(key: string, value: string, searchParams: URLSearchParams, router: ReturnType<typeof useRouter>, pathname: string) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (ref.current) clearTimeout(ref.current)
    ref.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) { params.set(key, value.trim()) } else { params.delete(key) }
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => { if (ref.current) clearTimeout(ref.current) }
  }, [value])
}

export function VendasFiltros({ lojas, modelos, vendedores, lojaIdDefault, chassiInicial, nfInicial, dataInicioInicial, dataFimInicial, podeConciliacao }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [chassi,     setChassi]     = useState(chassiInicial)
  const [nf,         setNf]         = useState(nfInicial)
  const [dataInicio, setDataInicio] = useState(dataInicioInicial)
  const [dataFim,    setDataFim]    = useState(dataFimInicial)
  const [gaveta,     setGaveta]     = useState(false)

  useDebounce('q',  chassi, searchParams, router, pathname)
  useDebounce('nf', nf,     searchParams, router, pathname)

  const lojaParam     = searchParams.get('loja')
  const lojasSel      = lojaParam !== null ? parse(lojaParam) : (lojaIdDefault ? [lojaIdDefault] : [])
  const modelosSel    = parse(searchParams.get('modelo'))
  const vendedoresSel = parse(searchParams.get('vendedor'))
  const concSel       = parse(searchParams.get('conc'))

  function atualizar(chave: string, valores: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (valores.length > 0) { params.set(chave, valores.join(',')) } else { params.delete(chave) }
    router.push(`${pathname}?${params.toString()}`)
  }

  function atualizarData(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) { params.set(chave, valor) } else { params.delete(chave) }
    router.push(`${pathname}?${params.toString()}`)
  }

  function limpar() {
    setChassi('')
    setNf('')
    setDataInicio('')
    setDataFim('')
    router.push(pathname)
  }

  const temFiltro = searchParams.toString() !== ''

  // Conta o que a pessoa escolheu; o período padrão (últimos 30 dias) não conta.
  const ativos = [modelosSel, vendedoresSel, lojaParam !== null ? lojasSel : [], concSel].filter(l => l.length > 0).length
    + (nf ? 1 : 0) + (searchParams.get('de') || searchParams.get('ate') ? 1 : 0)

  const filtroModelo = (
    <MultiSelectFiltro
      placeholder="Modelo"
      opcoes={modelos.map(m => ({ value: m.id, label: m.modelo }))}
      selecionados={modelosSel}
      onChange={v => atualizar('modelo', v)}
      className="w-full lg:w-auto lg:min-w-[12rem]"
      comBusca
    />
  )
  const filtroVendedor = (
    <MultiSelectFiltro
      placeholder="Vendedor"
      opcoes={vendedores.map(v => ({ value: v.id, label: v.nome }))}
      selecionados={vendedoresSel}
      onChange={v => atualizar('vendedor', v)}
      className="w-full lg:w-auto lg:min-w-[11rem]"
      comBusca
    />
  )
  const filtroLoja = lojas.length > 0 && (
    <MultiSelectFiltro
      placeholder="Loja"
      opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
      selecionados={lojasSel}
      onChange={v => atualizar('loja', v)}
      className="w-full lg:w-auto lg:min-w-[11rem]"
    />
  )
  const filtroConc = podeConciliacao && (
    <MultiSelectFiltro
      placeholder="Conciliação"
      opcoes={CONC_OPCOES}
      selecionados={concSel}
      onChange={v => atualizar('conc', v)}
      className="w-full lg:w-auto lg:min-w-[10rem]"
    />
  )
  const buscaChassi = (largura: string) => (
    <div className={`relative ${largura}`}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar chassi..."
        aria-label="Buscar chassi"
        value={chassi}
        onChange={e => setChassi(e.target.value)}
        className="h-10 pr-9 pl-8 md:text-base lg:h-9 lg:text-sm"
      />
      {chassi && (
        <button type="button" onClick={() => setChassi('')} aria-label="Limpar busca"
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
  const buscaNf = (largura: string) => (
    <div className={`relative ${largura}`}>
      <FileText size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar NF..."
        aria-label="Buscar NF"
        value={nf}
        onChange={e => setNf(e.target.value)}
        className="h-10 pl-8 md:text-base lg:h-9 lg:text-sm"
      />
    </div>
  )
  const periodo = (
    <div className="flex items-center gap-1.5">
      <CalendarRange size={15} className="shrink-0 text-muted-foreground" />
      <Input
        type="date"
        aria-label="De"
        value={dataInicio}
        onChange={e => { setDataInicio(e.target.value); atualizarData('de', e.target.value) }}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <Input
        type="date"
        aria-label="Até"
        value={dataFim}
        onChange={e => { setDataFim(e.target.value); atualizarData('ate', e.target.value) }}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm"
      />
    </div>
  )

  return (
    <>
      {/* Celular/tablet: busca à vista e um botão "Filtros" com o resto numa gaveta. */}
      <div className="flex gap-2 lg:hidden">
        {buscaChassi('min-w-0 flex-1')}
        <Button type="button" variant="outline" onClick={() => setGaveta(true)} className="h-10 gap-1.5">
          <Filter className="size-4" /> Filtros
          {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{ativos}</span>}
        </Button>
      </div>

      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          <SheetTitle className="mb-3 text-base">Filtros</SheetTitle>
          <div className="space-y-3">
            {filtroModelo}
            {filtroVendedor}
            {filtroLoja}
            {filtroConc}
            {buscaNf('w-full')}
            <div>
              <p className="mb-1 text-sm font-medium">Período</p>
              {periodo}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={limpar} className="h-11 flex-1 border-input">Limpar</Button>
              <Button type="button" onClick={() => setGaveta(false)} className="h-11 flex-1">Ver vendas</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: as duas linhas de sempre. */}
      <div className="hidden space-y-3 rounded-lg border border-border bg-card p-3 lg:block">
        <div className="flex flex-wrap items-center gap-2">
          {filtroModelo}
          {filtroVendedor}
          {filtroLoja}
          {filtroConc}
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limpar} className="ml-auto gap-1.5 text-muted-foreground hover:text-foreground">
              <X size={13} />
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {buscaChassi('w-44')}
          {buscaNf('w-36')}
          {periodo}
        </div>
      </div>
    </>
  )
}
