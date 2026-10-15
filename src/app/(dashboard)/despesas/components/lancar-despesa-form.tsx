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
  beneficiario: string | null
  lojaId: string | null
  lojaNome: string | null
  lancadoPorNome: string | null
  lancadoEm: string | null
}

type Props = {
  id: string
  lojas: { id: string; nome: string }[]
  categorias: string[]
  categoriasComBeneficiario: string[]
  beneficiarios: string[]
  jaLancado: JaLancado | null
  podeCategorizar: boolean
}

export function LancarDespesaForm({ id, lojas, categorias, categoriasComBeneficiario, beneficiarios, jaLancado, podeCategorizar }: Props) {
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [categoria, setCategoria] = useState(jaLancado?.categoria ?? '')
  const [lojaId, setLojaId] = useState(jaLancado?.lojaId ?? '')
  const [lojaEscolhida, setLojaEscolhida] = useState(!!jaLancado)
  const [beneficiario, setBeneficiario] = useState(jaLancado?.beneficiario ?? '')

  const exigeBeneficiario = categoriasComBeneficiario.includes(categoria)

  function lancar() {
    if (!categoria || !lojaEscolhida) {
      toast.error('Escolha categoria e loja')
      return
    }
    if (exigeBeneficiario && !beneficiario) {
      toast.error('Escolha a quem se destinou')
      return
    }
    startTransition(async () => {
      try {
        await lancarDespesaOpenFinanceAction(id, categoria, lojaId || null, exigeBeneficiario ? beneficiario : null)
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
    if (exigeBeneficiario && !beneficiario) {
      toast.error('Escolha a quem se destinou')
      return
    }
    startTransition(async () => {
      try {
        await editarCategorizacaoOpenFinanceAction(id, categoria, lojaId || null, exigeBeneficiario ? beneficiario : null)
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
          <span className="font-medium text-primary-text border-l-2 border-primary pl-2">
            Lançada — {jaLancado.categoria ?? '—'}{jaLancado.beneficiario ? ` (${jaLancado.beneficiario})` : ''} · {jaLancado.lojaNome ?? 'Geral'}
          </span>
          {(jaLancado.lancadoPorNome || quando) && (
            <p className="text-muted-foreground mt-0.5">{jaLancado.lancadoPorNome ?? 'Automático'}{quando ? ` · ${quando}` : ''}</p>
          )}
        </div>
        {podeCategorizar && (
          <>
            <button
              onClick={() => setEditando(true)}
              disabled={pending}
              title="Editar categorização"
              className="text-muted-foreground hover:text-primary-text p-1 disabled:opacity-50"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={cancelarCategorizacao}
              disabled={pending}
              title="Cancelar categorização"
              className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
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
      <span className="text-xs font-medium text-warning border-l-2 border-warning pl-2">
        Pendente de categorização
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={categoria}
        onChange={e => setCategoria(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-base outline-none md:h-9 md:text-sm"
      >
        <option value="">Categoria...</option>
        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {/* Só aparece nas categorias que pedem (retirada, pró-labore) — a linha já é
          apertada e um select a mais atrapalharia sem informar nada. */}
      {exigeBeneficiario && (
        <select
          value={beneficiario}
          onChange={e => setBeneficiario(e.target.value)}
          className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-base outline-none md:h-9 md:text-sm"
        >
          <option value="">Para quem...</option>
          {beneficiarios.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      <select
        value={lojaId}
        onChange={e => { setLojaId(e.target.value); setLojaEscolhida(true) }}
        className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-base outline-none md:h-9 md:text-sm"
      >
        <option value="" disabled={!lojaEscolhida}>Loja...</option>
        <option value="">Geral — empresa</option>
        {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      <Button
        size="sm"
        className="h-11 text-base md:h-9 md:text-sm"
        disabled={pending || !categoria || !lojaEscolhida || (exigeBeneficiario && !beneficiario)}
        onClick={jaLancado ? salvarEdicao : lancar}
      >
        {pending ? 'Salvando…' : jaLancado ? 'Salvar' : 'Lançar'}
      </Button>
      {jaLancado && (
        <Button
          size="sm"
          variant="outline"
          className="h-11 text-base md:h-9 md:text-sm"
          disabled={pending}
          onClick={() => setEditando(false)}
        >
          Voltar
        </Button>
      )}
    </div>
  )
}
