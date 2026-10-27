'use client'
import { useRouter, useSearchParams } from 'next/navigation'

/** Só para admin: escolhe de qual loja o catálogo mostra e ajusta o estoque (#195). */
export function LojaEstoqueSelect({ lojas, lojaId }: { lojas: { id: string; nome: string }[]; lojaId: string | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function mudar(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('estoque', id)
    router.replace(`?${p.toString()}`)
  }

  // <select> nativo: o Select do base-ui mostra o value cru quando ele não é o rótulo.
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Estoque da loja
      <select
        value={lojaId ?? ''}
        onChange={e => mudar(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-2 text-base text-foreground lg:h-9 lg:text-sm"
      >
        {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    </label>
  )
}
