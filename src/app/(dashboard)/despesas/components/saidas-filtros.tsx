'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RefreshCw, X } from 'lucide-react'

type Loja = { id: string; nome: string }

export function SaidasFiltros({
  categorias, lojas, categoriaAtual, lojaAtual, tipoAtual,
}: {
  categorias: string[]
  lojas: Loja[]
  categoriaAtual: string
  lojaAtual: string
  tipoAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [categoria, setCategoria] = useState(categoriaAtual)
  const [lojaId, setLojaId] = useState(lojaAtual)
  const [tipo, setTipo] = useState(tipoAtual)

  const temFiltro = !!categoria || !!lojaId || !!tipo

  function aplicar() {
    const p = new URLSearchParams(params.toString())
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
      <div className="grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Categoria</Label>
          {/* <select> nativo: o value da loja é UUID e não bate com o label exibido */}
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="block h-11 w-full rounded-md border border-input bg-card px-2 text-base md:h-8 md:w-48 md:text-sm"
          >
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Loja</Label>
          <select
            value={lojaId}
            onChange={e => setLojaId(e.target.value)}
            className="block h-11 w-full rounded-md border border-input bg-card px-2 text-base md:h-8 md:w-44 md:text-sm"
          >
            <option value="">Todas</option>
            {/* Saída sem loja atribuída = despesa geral da empresa. Mesma convenção
                "__geral" que a tabela de lançamentos já usa. */}
            <option value="__geral">Geral (Empresa)</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo de saída</Label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="block h-11 w-full rounded-md border border-input bg-card px-2 text-base md:h-8 md:w-44 md:text-sm"
          >
            <option value="">Todas</option>
            <option value="operacional">Operacional</option>
            <option value="nao_operacional">Não operacional</option>
          </select>
        </div>
        <Button variant="outline" onClick={aplicar} className="col-span-2 h-11 gap-2 md:col-span-1 md:h-8 md:text-sm">
          <RefreshCw size={14} />
          Aplicar filtros
        </Button>
        {temFiltro && (
          <Button variant="ghost" onClick={limpar} className="col-span-2 h-11 gap-1 text-muted-foreground md:col-span-1 md:h-8 md:text-sm">
            <X size={14} />
            Limpar
          </Button>
        )}
      </div>
      {(!!categoria || !!lojaId) && (
        <p className="text-xs text-warning">
          Filtro ativo — as saídas ainda não categorizadas não aparecem nesta lista.
        </p>
      )}
    </div>
  )
}
