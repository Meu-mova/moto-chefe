'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Loja = { id: string; nome: string }

export function LojaFilter({ lojas, current }: { lojas: Loja[]; current?: string }) {
  const router = useRouter()
  const sp = useSearchParams()

  function onChange(val: string | null) {
    if (!val) return
    const p = new URLSearchParams(sp.toString())
    if (val === '__todas') p.delete('loja')
    else p.set('loja', val)
    router.push(`/compras?${p.toString()}`)
  }

  return (
    <Select value={current ?? '__todas'} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todas as lojas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__todas">Todas as lojas</SelectItem>
        {lojas.map(l => (
          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
