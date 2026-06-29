'use client'
import { useTransition } from 'react'
import { FileDown } from 'lucide-react'
import { buscarDanfeAction } from '@/app/(dashboard)/vendas/actions'

export function DanfeButton({ motoId }: { motoId: string }) {
  const [pending, startTransition] = useTransition()

  function baixar() {
    startTransition(async () => {
      try {
        const { linkDanfe, linkPDF } = await buscarDanfeAction(motoId)
        const url = linkDanfe ?? linkPDF
        if (url) window.open(url, '_blank')
      } catch (e: any) {
        alert(e.message ?? 'Erro ao buscar DANFE')
      }
    })
  }

  return (
    <button
      onClick={baixar}
      disabled={pending}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
      title="Baixar DANFE"
    >
      <FileDown size={13} />
      {pending ? 'Buscando…' : 'DANFE'}
    </button>
  )
}
