'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { inativarPecaAction, reativarPecaAction } from '../actions'

export function PecaAtivoToggle({ id, ativo }: { id: string; ativo: boolean }) {
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      try {
        if (ativo) await inativarPecaAction(id)
        else await reativarPecaAction(id)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar status')
      }
    })
  }

  return (
    <button onClick={toggle} disabled={pending} className="disabled:opacity-50" title={ativo ? 'Clique para inativar' : 'Clique para reativar'}>
      <Badge variant={ativo ? 'default' : 'outline'}>
        {pending ? '...' : ativo ? 'Ativo' : 'Inativo'}
      </Badge>
    </button>
  )
}
