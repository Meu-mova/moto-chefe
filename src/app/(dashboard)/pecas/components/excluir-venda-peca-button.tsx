'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { excluirVendaPecaAction } from '../actions'

type Props = { vendaId: string; numero: number }

// Venda de peça não tem tela de edição: lançamento errado se resolve apagando e
// refazendo. O aviso do confirm() é o único lugar onde o operador lê o que a exclusão
// mexe — estoque e conciliação —, então não encurtar.
export function ExcluirVendaPecaButton({ vendaId, numero }: Props) {
  const [pending, start] = useTransition()

  function excluir() {
    const ok = confirm(
      `Excluir a venda de peças #${numero}?\n\n` +
      `• O estoque dos itens volta para o catálogo\n` +
      `• Transações de cartão/PIX conciliadas com ela ficam livres de novo\n\n` +
      `Esta ação não pode ser desfeita.`,
    )
    if (!ok) return
    start(async () => {
      try {
        await excluirVendaPecaAction(vendaId)
        toast.success(`Venda #${numero} excluída`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir a venda')
      }
    })
  }

  return (
    <button
      onClick={excluir}
      disabled={pending}
      title="Excluir venda"
      className="text-slate-400 hover:text-red-600 disabled:opacity-40 transition-colors"
    >
      <Trash2 size={15} />
    </button>
  )
}
