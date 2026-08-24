'use client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'

type Loja = { id: string; nome: string }

export function FinanceiroFiltros({ lojas, mesAtual, lojaAtual }: {
  lojas: Loja[]
  mesAtual: string
  lojaAtual: string
}) {
  const router = useRouter()

  function update(key: string, val: string) {
    const p = new URLSearchParams()
    if (key === 'mes') {
      p.set('mes', val)
      if (lojaAtual) p.set('loja', lojaAtual)
    } else {
      p.set('mes', mesAtual)
      if (val) p.set('loja', val)
    }
    router.push(`/financeiro?${p.toString()}`)
  }

  return (
    <div className="flex items-center gap-4">
      <Input
        type="month"
        value={mesAtual}
        onChange={e => update('mes', e.target.value)}
        className="w-44"
      />
      <select
        value={lojaAtual}
        onChange={e => update('loja', e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none w-48"
      >
        <option value="">Todas as lojas</option>
        {/* O balde da empresa: despesas sem loja atribuída. Não é uma loja, mas é
            um recorte de dinheiro — e este seletor é onde se escolhe o recorte. */}
        <option value="geral">Geral (Empresa)</option>
        {lojas.map(l => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>
    </div>
  )
}
