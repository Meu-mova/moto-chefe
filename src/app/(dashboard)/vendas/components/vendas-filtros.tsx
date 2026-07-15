'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'
import { Search, FileText, CalendarRange, X } from 'lucide-react'

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

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
      {/* Linha 1 — filtros por seleção */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFiltro
          placeholder="Modelo"
          opcoes={modelos.map(m => ({ value: m.id, label: m.modelo }))}
          selecionados={modelosSel}
          onChange={v => atualizar('modelo', v)}
          className="min-w-[12rem]"
          comBusca
        />

        <MultiSelectFiltro
          placeholder="Vendedor"
          opcoes={vendedores.map(v => ({ value: v.id, label: v.nome }))}
          selecionados={vendedoresSel}
          onChange={v => atualizar('vendedor', v)}
          className="min-w-[11rem]"
          comBusca
        />

        {lojas.length > 0 && (
          <MultiSelectFiltro
            placeholder="Loja"
            opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
            selecionados={lojasSel}
            onChange={v => atualizar('loja', v)}
            className="min-w-[11rem]"
          />
        )}

        {podeConciliacao && (
          <MultiSelectFiltro
            placeholder="Conciliação"
            opcoes={CONC_OPCOES}
            selecionados={concSel}
            onChange={v => atualizar('conc', v)}
            className="min-w-[10rem]"
          />
        )}

        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar} className="ml-auto text-slate-500 hover:text-slate-800 gap-1.5">
            <X size={13} />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Linha 2 — busca por texto e período */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar chassi..."
            value={chassi}
            onChange={e => setChassi(e.target.value)}
            className="h-9 w-44 pl-8"
          />
        </div>

        <div className="relative">
          <FileText size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar NF..."
            value={nf}
            onChange={e => setNf(e.target.value)}
            className="h-9 w-36 pl-8"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <CalendarRange size={15} className="text-slate-400 shrink-0" />
          <Input
            type="date"
            value={dataInicio}
            onChange={e => { setDataInicio(e.target.value); atualizarData('de', e.target.value) }}
            className="h-9 w-36"
          />
          <span className="text-xs text-slate-400">até</span>
          <Input
            type="date"
            value={dataFim}
            onChange={e => { setDataFim(e.target.value); atualizarData('ate', e.target.value) }}
            className="h-9 w-36"
          />
        </div>
      </div>
    </div>
  )
}
