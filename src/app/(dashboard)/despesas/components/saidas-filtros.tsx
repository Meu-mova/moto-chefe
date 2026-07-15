'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw } from 'lucide-react'

export function SaidasFiltros({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  function aplicar() {
    const p = new URLSearchParams(params.toString())
    if (fromRef.current?.value) p.set('sfrom', fromRef.current.value)
    if (toRef.current?.value) p.set('sto', toRef.current.value)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">De</Label>
        <Input ref={fromRef} type="date" defaultValue={defaultFrom} className="w-36 h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Até</Label>
        <Input ref={toRef} type="date" defaultValue={defaultTo} className="w-36 h-8 text-sm" />
      </div>
      <Button size="sm" variant="outline" onClick={aplicar} className="h-8 gap-2">
        <RefreshCw size={14} />
        Atualizar
      </Button>
    </div>
  )
}
