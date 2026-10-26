'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'

type Loja   = { id: string; nome: string }
type Modelo = { id: string; modelo: string }

type Props = {
  lojas: Loja[]
  modelos: Modelo[]
  isAdmin: boolean
  chassiInicial: string
  nfInicial: string
}

export function GarantiasFiltros({ lojas, modelos, isAdmin, chassiInicial, nfInicial }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const [chassi, setChassi] = useState(chassiInicial)
  const [nf, setNf] = useState(nfInicial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function navigate(key: string, value: string) {
    const p = new URLSearchParams(sp.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`/garantias?${p.toString()}`)
  }

  function debounce(key: string, value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => navigate(key, value), 350)
  }

  useEffect(() => { setChassi(chassiInicial) }, [chassiInicial])
  useEffect(() => { setNf(nfInicial) }, [nfInicial])

  const statusAtual  = sp.get('status') ?? ''
  const lojaAtual    = sp.get('loja') ?? ''
  const modeloAtual  = sp.get('modelo') ?? ''

  function getVal(key: string) { return sp.get(key) ?? '' }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Chassi */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-7 h-9 w-44 text-sm"
          placeholder="Chassi…"
          value={chassi}
          onChange={e => { setChassi(e.target.value); debounce('q', e.target.value) }}
        />
      </div>

      {/* Nº Pedido Fábrica */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-7 h-9 w-52 text-sm"
          placeholder="Nº pedido fábrica…"
          value={nf}
          onChange={e => { setNf(e.target.value); debounce('nf', e.target.value) }}
        />
      </div>

      {/* Modelo */}
      <MultiSelectFiltro
        placeholder="Modelo"
        opcoes={modelos.map(m => ({ value: m.id, label: m.modelo }))}
        selecionados={modeloAtual ? [modeloAtual] : []}
        onChange={vals => navigate('modelo', vals[0] ?? '')}
        comBusca
      />

      {/* Status */}
      <Select
        value={statusAtual || '__todos'}
        onValueChange={(v: string | null) => navigate('status', !v || v === '__todos' ? '' : v)}
      >
        <SelectTrigger className="h-9 w-36 text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__todos">Todos</SelectItem>
          <SelectItem value="ativa">Ativas</SelectItem>
          <SelectItem value="encerrada">Encerradas</SelectItem>
        </SelectContent>
      </Select>

      {/* Loja — admin only */}
      {isAdmin && (
        <Select
          value={lojaAtual || '__todas'}
          onValueChange={(v: string | null) => navigate('loja', !v || v === '__todas' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="Loja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as lojas</SelectItem>
            {lojas.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
