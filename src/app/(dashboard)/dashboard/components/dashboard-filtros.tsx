'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

type Props = {
  lojas: { id: string; nome: string }[]
  vendedores: { id: string; nome: string }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
  deDefault: string
  ateDefault: string
}

export function DashboardFiltros({ lojas, vendedores, isAdmin, lojaUsuarioId, deDefault, ateDefault }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const deAtual = searchParams.get('de') ?? deDefault
  const ateAtual = searchParams.get('ate') ?? ateDefault
  const lojaAtual = searchParams.get('loja') ?? ''
  const vendedorAtual = searchParams.get('vendedor') ?? ''

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [router, pathname, searchParams])

  const campo = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground lg:w-auto'
  return (
    // Celular e tablet: grade de 2 colunas na largura toda; desktop: em linha ao lado do título.
    <div className={`grid grid-cols-2 items-end gap-2 transition-opacity lg:flex lg:flex-wrap lg:items-center lg:gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground lg:flex-row lg:items-center lg:gap-2 lg:text-sm">
        De
        <input type="date" value={deAtual} onChange={e => update('de', e.target.value)} className={campo} disabled={isPending} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground lg:flex-row lg:items-center lg:gap-2 lg:text-sm">
        Até
        <input type="date" value={ateAtual} onChange={e => update('ate', e.target.value)} className={campo} disabled={isPending} />
      </label>

      {isAdmin && (
        <select value={lojaAtual} onChange={e => update('loja', e.target.value)} className={campo} disabled={isPending} aria-label="Loja">
          <option value="">Todas as lojas</option>
          {lojas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      )}

      {isAdmin && (
        <select value={vendedorAtual} onChange={e => update('vendedor', e.target.value)} className={campo} disabled={isPending} aria-label="Vendedor">
          <option value="">Todos os vendedores</option>
          {vendedores.map(v => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
      )}
      {isPending && <Loader2 size={14} className="col-span-2 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  )
}
