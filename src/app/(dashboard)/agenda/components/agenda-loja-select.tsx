'use client'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = { lojas: { id: string; nome: string }[]; lojaAtual: string }

export function AgendaLojaSelect({ lojas, lojaAtual }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function onChange(lojaId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (lojaId) params.set('loja', lojaId)
    else params.delete('loja')
    router.replace(`/agenda?${params}`)
  }

  return (
    <select value={lojaAtual} onChange={e => onChange(e.target.value)}
      className="border border-border rounded-md px-3 py-1.5 text-sm bg-card">
      <option value="">Todas as lojas</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )
}
