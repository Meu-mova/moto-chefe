// src/app/(dashboard)/estoque/[id]/components/status-actions.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getTransicoesPermitidas, statusLabel, type Status } from '@/lib/estado-moto'
import { alterarStatusAction } from '../actions'

type Props = {
  motoId: string
  statusAtual: string
  papel: string
  lojaIdUsuario: string | null
  lojaIdMoto: string
}

export function StatusActions({ motoId, statusAtual, papel, lojaIdUsuario, lojaIdMoto }: Props) {
  const [open, setOpen] = useState(false)
  const [novoStatus, setNovoStatus] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const isMinhaLoja = lojaIdUsuario === lojaIdMoto
  const permitidas = getTransicoesPermitidas(statusAtual as any, papel as any, isMinhaLoja)

  if (permitidas.length === 0) return null

  async function handleConfirm() {
    setLoading(true)
    try {
      await alterarStatusAction(motoId, novoStatus, observacao)
      setOpen(false)
      setObservacao('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {permitidas.map(status => (
          <Button
            key={status}
            variant="outline"
            size="sm"
            onClick={() => { setNovoStatus(status); setOpen(true) }}
          >
            → {statusLabel[status]}
          </Button>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar mudança de status</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Alterar status para <strong>{statusLabel[novoStatus as Status]}</strong>?
          </p>
          <Textarea
            placeholder="Observação (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
