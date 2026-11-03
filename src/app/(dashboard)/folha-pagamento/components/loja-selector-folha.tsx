'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { hrefComFiltro } from '@/lib/folha-tela'

export function LojaSelectorFolha({ lojas, lojaAtual }: {
  lojas: { id: string; nome: string }[]
  lojaAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  return (
    // <select> nativo de propósito: o <Select> do projeto mostra o value cru
    // quando ele difere do rótulo (id da loja vs nome).
    <select
      aria-label="Loja"
      value={lojaAtual}
      onChange={e => startTransition(() => router.push(hrefComFiltro(pathname, searchParams.toString(), 'loja', e.target.value)))}
      disabled={pendente}
      className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm @[960px]/folha:h-9"
    >
      <option value="">Todas as lojas</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )
}
