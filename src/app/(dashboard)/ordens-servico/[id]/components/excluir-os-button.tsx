'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { excluirOSAction } from '../../actions'

type Props = { osId: string; numero: number | null }

export function ExcluirOSButton({ osId, numero }: Props) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function excluir() {
    if (!confirm(`Excluir OS #${numero ?? ''}? Esta ação não pode ser desfeita.`)) return
    start(async () => {
      try {
        await excluirOSAction(osId)
        toast.success('OS excluída')
        router.push('/ordens-servico')
      } catch (e: any) {
        toast.error(e.message ?? 'Erro ao excluir')
      }
    })
  }

  return (
    <button
      onClick={excluir}
      disabled={pending}
      title="Excluir OS"
      className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-input px-3 text-sm transition-colors sm:h-auto sm:py-1.5 text-destructive hover:border-destructive hover:bg-destructive/10 disabled:opacity-50"
    >
      <Trash2 size={15} className="shrink-0" /> {pending ? 'Excluindo…' : <span>Excluir<span className="hidden sm:inline"> OS</span></span>}
    </button>
  )
}
