'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Pencil, X } from 'lucide-react'
import {
  lancarDespesaOpenFinanceAction,
  editarCategorizacaoOpenFinanceAction,
  cancelarCategorizacaoOpenFinanceAction,
} from '../actions'

type JaLancado = {
  categoria: string | null
  lojaId: string | null
  lojaNome: string | null
  lancadoPorNome: string | null
  lancadoEm: string | null
}

type Props = {
  id: string
  lojas: { id: string; nome: string }[]
  categorias: string[]
  jaLancado: JaLancado | null
  podeCategorizar: boolean
}

export function LancarDespesaForm({ id, lojas, categorias, jaLancado, podeCategorizar }: Props) {
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [categoria, setCategoria] = useState(jaLancado?.categoria ?? '')
  const [lojaId, setLojaId] = useState(jaLancado?.lojaId ?? '')
  const [lojaEscolhida, setLojaEscolhida] = useState(!!jaLancado)

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

  function salvarEdicao() {
    if (!categoria || !lojaEscolhida) {
      toast.error('Escolha categoria e loja')
      return
    }
    startTransition(async () => {
      try {
        await editarCategorizacaoOpenFinanceAction(id, categoria, lojaId || null)
        toast.success('Categorização atualizada')
        setEditando(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  function cancelarCategorizacao() {
    if (!confirm('Cancelar a categorização dessa saída? A despesa lançada será removida e ela volta para pendente.')) return
    startTransition(async () => {
      try {
        await cancelarCategorizacaoOpenFinanceAction(id)
        toast.success('Categorização cancelada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cancelar')
      }
    })
  }

  if (jaLancado && !editando) {
    const quando = jaLancado.lancadoEm
      ? new Date(jaLancado.lancadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : null
    return (
      <div className="flex items-center gap-1">
        <div className="text-xs">
          <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            Lançada — {jaLancado.categoria ?? '—'} · {jaLancado.lojaNome ?? 'Geral'}
          </span>
          {(jaLancado.lancadoPorNome || quando) && (
            <p className="text-slate-400 mt-0.5">{jaLancado.lancadoPorNome ?? 'Automático'}{quando ? ` · ${quando}` : ''}</p>
          )}
        </div>
        {podeCategorizar && (
          <>
            <button
              onClick={() => setEditando(true)}
              disabled={pending}
              title="Editar categorização"
              className="text-slate-400 hover:text-blue-600 p-1 disabled:opacity-50"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={cancelarCategorizacao}
              disabled={pending}
              title="Cancelar categorização"
              className="text-slate-400 hover:text-red-600 p-1 disabled:opacity-50"
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
    )
  }

  // Quem não categoriza vê a saída e o status, só não tem os controles.
  if (!podeCategorizar) {
    return (
      <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        Pendente de categorização
      </span>
    )
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
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={pending || !categoria || !lojaEscolhida}
        onClick={jaLancado ? salvarEdicao : lancar}
      >
        {pending ? 'Salvando…' : jaLancado ? 'Salvar' : 'Lançar'}
      </Button>
      {jaLancado && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={pending}
          onClick={() => setEditando(false)}
        >
          Voltar
        </Button>
      )}
    </div>
  )
}
