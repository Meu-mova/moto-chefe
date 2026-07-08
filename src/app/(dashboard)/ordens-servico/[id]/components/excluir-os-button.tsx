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
      className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-red-300 transition-colors disabled:opacity-50"
    >
      <Trash2 size={15} /> {pending ? 'Excluindo…' : 'Excluir OS'}
    </button>
  )
}
