'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { excluirVendaPecaAction } from '../actions'

type Props = { vendaId: string; numero: number }

// Itens e pagamentos se corrigem pelo editar (#242); excluir é para a venda que não
// devia existir. O aviso do confirm() é o único lugar onde o operador lê o que a exclusão
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
    <Button variant="outline" onClick={excluir} disabled={pending} className="h-10 flex-1 gap-1.5 text-destructive hover:text-destructive">
      <Trash2 className="size-4" /> Excluir
    </Button>
  )
}
