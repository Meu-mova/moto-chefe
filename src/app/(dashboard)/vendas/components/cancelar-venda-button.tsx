'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { XCircle } from 'lucide-react'
import { cancelarVendaCompletaAction } from '../actions'

type Props = {
  vendaId: string
  descricao: string
}

export function CancelarVendaButton({ vendaId, descricao }: Props) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!motivo.trim()) {
      toast.error('Informe o motivo do cancelamento')
      return
    }
    setLoading(true)
    try {
      await cancelarVendaCompletaAction(vendaId, motivo)
      toast.success('Venda cancelada com sucesso')
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Cancelar Venda"
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
      >
        <XCircle size={16} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Venda</DialogTitle>
            <p className="text-sm text-slate-500 pt-1">{descricao}</p>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Esta ação irá reverter a venda: a moto voltará ao showroom como disponível,
              o lançamento de caixa será removido e o pedido será cancelado.
            </p>
            <div className="space-y-2">
              <Label>Motivo do cancelamento <span className="text-red-500">*</span></Label>
              <Textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
