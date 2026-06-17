'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFiltro } from './multi-select-filtro'

type Loja = { id: string; nome: string }
type Modelo = { id: string; modelo: string }

const DISP_DEFAULT = ['disponivel', 'reservada']

const statusOpcoes = [
  { value: 'caixa',       label: 'Caixa' },
  { value: 'montada',     label: 'Montada' },
  { value: 'em_garantia', label: 'Garantia' },
]

const dispOpcoes = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservada',  label: 'Reservada' },
]

type Props = {
  lojas: Loja[]
  modelos: Modelo[]
  cores: string[]
  lojaIdDefault: string | null
  chassiInicial: string
}

function parse(param: string | null): string[] {
  if (!param) return []
  return param.split(',').filter(Boolean)
}

export function EstoqueFiltros({ lojas, modelos, cores, lojaIdDefault, chassiInicial }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [chassi, setChassi] = useState(chassiInicial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (chassi.trim()) {
        params.set('q', chassi.trim())
      } else {
        params.delete('q')
      }
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [chassi])

  // Lê os filtros atuais da URL
  // loja: sem param → usa o default do usuário (não-admin), ou vazio (admin)
  const lojaParam    = searchParams.get('loja')
  const lojasSel     = lojaParam !== null ? parse(lojaParam) : (lojaIdDefault ? [lojaIdDefault] : [])
  const modelosSel   = parse(searchParams.get('modelo'))
  const coresSel     = parse(searchParams.get('cor'))
  const statusSel    = parse(searchParams.get('status'))
  const dispSel      = parse(searchParams.get('disponibilidade'))

  function atualizar(chave: string, valores: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (valores.length > 0) {
      params.set(chave, valores.join(','))
    } else {
      params.delete(chave)
    }
    // Quando disponibilidade é alterada, sempre registra na URL
    // (assim o usuário pode selecionar "nenhuma" para ver tudo)
    if (chave === 'disponibilidade') {
      params.set(chave, valores.join(','))
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function limpar() {
    setChassi('')
    router.push(pathname)
  }

  // Considera que há filtro ativo se qualquer param existir
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
        className="h-9 w-48"
      />

      <MultiSelectFiltro
        placeholder="Cor"
        opcoes={cores.map(c => ({ value: c, label: c }))}
        selecionados={coresSel}
        onChange={v => atualizar('cor', v)}
        className="min-w-[9rem]"
        comBusca
      />

      <MultiSelectFiltro
        placeholder="Loja"
        opcoes={lojas.map(l => ({ value: l.id, label: l.nome }))}
        selecionados={lojasSel}
        onChange={v => atualizar('loja', v)}
        className="min-w-[11rem]"
      />

      <MultiSelectFiltro
        placeholder="Status"
        opcoes={statusOpcoes}
        selecionados={statusSel}
        onChange={v => atualizar('status', v)}
        className="min-w-[9rem]"
      />

      <MultiSelectFiltro
        placeholder="Disponibilidade"
        opcoes={dispOpcoes}
        selecionados={dispSel}
        onChange={v => atualizar('disponibilidade', v)}
        className="min-w-[11rem]"
      />

      {temFiltro && (
        <Button variant="ghost" size="sm" onClick={limpar} className="text-slate-500">
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
