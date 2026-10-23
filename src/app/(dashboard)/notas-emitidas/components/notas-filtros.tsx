'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

// Mesmo visual e comportamento do dashboard-filtros.
export function NotasFiltros({ de, ate, ambiente }: { de: string; ate: string; ambiente: 'Producao' | 'Homologacao' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [router, pathname, searchParams])

  const rotulo = 'flex flex-col gap-1 text-xs text-muted-foreground lg:flex-row lg:items-center lg:gap-2 lg:text-sm'
  const campo = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground lg:w-auto'
  return (
    <div className={`grid grid-cols-2 items-end gap-2 transition-opacity sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center lg:gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <label className={rotulo}>
        De
        <input type="date" value={de} onChange={e => update('de', e.target.value)} className={campo} disabled={isPending} />
      </label>
      <label className={rotulo}>
        Até
        <input type="date" value={ate} onChange={e => update('ate', e.target.value)} className={campo} disabled={isPending} />
      </label>
      <label className={`${rotulo} col-span-2 sm:col-span-1`}>
        Ambiente
        <select value={ambiente} onChange={e => update('ambiente', e.target.value)} className={campo} disabled={isPending}>
          <option value="Producao">Produção</option>
          <option value="Homologacao">Homologação</option>
        </select>
      </label>
      {isPending && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
    </div>
  )
}
