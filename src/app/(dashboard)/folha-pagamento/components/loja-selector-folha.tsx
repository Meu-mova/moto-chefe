'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export function LojaSelectorFolha({ lojas, lojaAtual }: {
  lojas: { id: string; nome: string }[]
  lojaAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  function trocar(valor: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set('loja', valor)
    else params.delete('loja')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    // <select> nativo de propósito: o <Select> do projeto mostra o value cru
    // quando ele difere do rótulo (id da loja vs nome).
    <select
      value={lojaAtual}
      onChange={e => trocar(e.target.value)}
      disabled={pendente}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      <option value="">Todas as lojas</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )
}
