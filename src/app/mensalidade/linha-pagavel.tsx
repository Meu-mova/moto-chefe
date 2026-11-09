'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { linkPagamentoAction } from './actions'

export function BotaoPagar({ mensalidadeId }: { mensalidadeId: string }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      disabled={pendente}
      onClick={() => iniciar(async () => {
        const r = await linkPagamentoAction(mensalidadeId)
        if (r.ok) window.location.href = r.url
        else toast.error(r.erro)
      })}
    >
      {pendente ? 'Gerando link…' : 'Pagar'}
    </Button>
  )
}
