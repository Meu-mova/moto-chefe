'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

type Props = {
  lojas: { id: string; nome: string }[]
  vendedores: { id: string; nome: string }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
  mesDefault: string
}

export function DashboardFiltros({ lojas, vendedores, isAdmin, lojaUsuarioId, mesDefault }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const mesAtual = searchParams.get('mes') ?? mesDefault
  const lojaAtual = searchParams.get('loja') ?? ''
  const vendedorAtual = searchParams.get('vendedor') ?? ''

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">Mês</label>
        <input
          type="month"
          value={mesAtual}
          onChange={e => update('mes', e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        />
      </div>

      {isAdmin && (
        <select
          value={lojaAtual}
          onChange={e => update('loja', e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">Todas as lojas</option>
          {lojas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      )}

      {isAdmin && (
        <select
          value={vendedorAtual}
          onChange={e => update('vendedor', e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">Todos os vendedores</option>
          {vendedores.map(v => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
      )}
    </div>
  )
}
