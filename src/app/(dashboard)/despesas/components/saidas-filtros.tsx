'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, X } from 'lucide-react'

type Loja = { id: string; nome: string }

export function SaidasFiltros({
  defaultFrom, defaultTo, categorias, lojas, categoriaAtual, lojaAtual, tipoAtual,
}: {
  defaultFrom: string
  defaultTo: string
  categorias: string[]
  lojas: Loja[]
  categoriaAtual: string
  lojaAtual: string
  tipoAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const [categoria, setCategoria] = useState(categoriaAtual)
  const [lojaId, setLojaId] = useState(lojaAtual)
  const [tipo, setTipo] = useState(tipoAtual)

  const temFiltro = !!categoria || !!lojaId || !!tipo

  function aplicar() {
    const p = new URLSearchParams(params.toString())
    if (fromRef.current?.value) p.set('sfrom', fromRef.current.value)
    if (toRef.current?.value) p.set('sto', toRef.current.value)
    if (categoria) p.set('scat', categoria); else p.delete('scat')
    if (lojaId) p.set('sloja', lojaId); else p.delete('sloja')
    if (tipo) p.set('stipo', tipo); else p.delete('stipo')
    router.push(`${pathname}?${p.toString()}`)
  }

  function limpar() {
    const p = new URLSearchParams(params.toString())
    p.delete('scat')
    p.delete('sloja')
    p.delete('stipo')
    setCategoria('')
    setLojaId('')
    setTipo('')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">De</Label>
          <Input ref={fromRef} type="date" defaultValue={defaultFrom} className="w-36 h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Até</Label>
          <Input ref={toRef} type="date" defaultValue={defaultTo} className="w-36 h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Categoria</Label>
          {/* <select> nativo: o value da loja é UUID e não bate com o label exibido */}
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="h-8 text-sm w-48 border border-slate-200 rounded-md px-2 bg-white block"
          >
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Loja</Label>
          <select
            value={lojaId}
            onChange={e => setLojaId(e.target.value)}
            className="h-8 text-sm w-44 border border-slate-200 rounded-md px-2 bg-white block"
          >
            <option value="">Todas</option>
            {/* Saída sem loja atribuída = despesa geral da empresa. Mesma convenção
                "__geral" que a tabela de lançamentos já usa. */}
            <option value="__geral">Geral (Empresa)</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Tipo de saída</Label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="h-8 text-sm w-44 border border-slate-200 rounded-md px-2 bg-white block"
          >
            <option value="">Todas</option>
            <option value="operacional">Operacional</option>
            <option value="nao_operacional">Não operacional</option>
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={aplicar} className="h-8 gap-2">
          <RefreshCw size={14} />
          Atualizar
        </Button>
        {temFiltro && (
          <Button size="sm" variant="ghost" onClick={limpar} className="h-8 gap-1 text-slate-500">
            <X size={14} />
            Limpar
          </Button>
        )}
      </div>
      {(!!categoria || !!lojaId) && (
        <p className="text-xs text-amber-600">
          Filtro ativo — as saídas ainda não categorizadas não aparecem nesta lista.
        </p>
      )}
    </div>
  )
}
