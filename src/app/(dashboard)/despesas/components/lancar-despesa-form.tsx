'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { lancarDespesaOpenFinanceAction } from '../actions'

type Props = {
  id: string
  lojas: { id: string; nome: string }[]
  categorias: string[]
  jaLancado: { lojaNome: string | null; lancadoPorNome: string | null; lancadoEm: string | null } | null
}

export function LancarDespesaForm({ id, lojas, categorias, jaLancado }: Props) {
  const [pending, startTransition] = useTransition()
  const [categoria, setCategoria] = useState('')
  const [lojaId, setLojaId] = useState('')
  const [lojaEscolhida, setLojaEscolhida] = useState(false)

  if (jaLancado) {
    const quando = jaLancado.lancadoEm
      ? new Date(jaLancado.lancadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null
    return (
      <div className="text-xs">
        <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          Lançada — {jaLancado.lojaNome ?? 'Geral'}
        </span>
        {(jaLancado.lancadoPorNome || quando) && (
          <p className="text-slate-400 mt-0.5">{jaLancado.lancadoPorNome ?? 'Automático'}{quando ? ` · ${quando}` : ''}</p>
        )}
      </div>
    )
  }

  function lancar() {
    if (!categoria || !lojaEscolhida) {
      toast.error('Escolha categoria e loja')
      return
    }
    startTransition(async () => {
      try {
        await lancarDespesaOpenFinanceAction(id, categoria, lojaId || null)
        toast.success('Despesa lançada!')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar')
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={categoria}
        onChange={e => setCategoria(e.target.value)}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
      >
        <option value="">Categoria...</option>
        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        value={lojaId}
        onChange={e => { setLojaId(e.target.value); setLojaEscolhida(true) }}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
      >
        <option value="" disabled={!lojaEscolhida}>Loja...</option>
        <option value="">Geral — empresa</option>
        {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      <Button size="sm" className="h-8 text-xs" disabled={pending || !categoria || !lojaEscolhida} onClick={lancar}>
        {pending ? 'Lançando…' : 'Lançar'}
      </Button>
    </div>
  )
}
