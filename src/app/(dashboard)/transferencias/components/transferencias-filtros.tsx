'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFiltro } from '../../estoque/components/multi-select-filtro'

type Loja   = { id: string; nome: string }
type Modelo = { id: string; modelo: string }

type Props = {
  lojas:   Loja[]
  modelos: Modelo[]
  isAdmin: boolean
}

const statusOpcoes = [
  { value: 'pendente',  label: 'Pendente' },
  { value: 'aceita',    label: 'Aceita' },
  { value: 'recusada',  label: 'Recusada' },
]

function parse(v: string | null): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export function TransferenciasFiltros({ lojas, modelos, isAdmin }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [chassi, setChassi] = useState(searchParams.get('q') ?? '')
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (chassi.trim()) { params.set('q', chassi.trim()) } else { params.delete('q') }
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [chassi])

  const statusSel    = parse(searchParams.get('status'))
  const modelosSel   = parse(searchParams.get('modelo'))
  const origemSel    = parse(searchParams.get('origem'))
  const destinoSel   = parse(searchParams.get('destino'))

  function atualizar(chave: string, valores: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (valores.length > 0) { params.set(chave, valores.join(',')) } else { params.delete(chave) }
    router.push(`${pathname}?${params.toString()}`)
  }

  function limpar() {
    setChassi('')
    router.push(pathname)
  }

  const temFiltro = searchParams.toString() !== ''

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <MultiSelectFiltro
        placeholder="Modelo"
        opcoes={modelos.map(m => ({ value: m.id, label: m.modelo }))}
        selecionados={modelosSel}
        onChange={v => atualizar('modelo', v)}
        className="min-w-[12rem]"
        comBusca
      />

      <Input
        placeholder="Buscar chassi..."
        value={chassi}
        onChange={e => setChassi(e.target.value)}
        className="h-9 w-44"
      />

      <MultiSelectFiltro
        placeholder="Status"
        opcoes={statusOpcoes}
        selecionados={statusSel}
        onChange={v => atualizar('status', v)}
        className="min-w-[9rem]"
      />

      {isAdmin && (
        <>
          <MultiSelectFiltro
            placeholder="Loja Origem"
            opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
            selecionados={origemSel}
            onChange={v => atualizar('origem', v)}
            className="min-w-[11rem]"
          />
          <MultiSelectFiltro
            placeholder="Loja Destino"
            opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
            selecionados={destinoSel}
            onChange={v => atualizar('destino', v)}
            className="min-w-[11rem]"
          />
        </>
      )}

      {temFiltro && (
        <Button variant="ghost" size="sm" onClick={limpar} className="text-slate-500">
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
