'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle } from 'lucide-react'
import { resolverGarantiaSemRegistroAction } from '../actions'

type Props = {
  motoId: string
  descricao: string
}

export function ResolverGarantiaButton({ motoId, descricao }: Props) {
  const [open, setOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await resolverGarantiaSemRegistroAction(motoId, observacao || undefined)
      toast.success('Garantia resolvida! Moto disponível.')
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
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-green-600 border-green-200 hover:bg-green-50"
      >
        <CheckCircle size={14} className="mr-1.5" />
        Resolver Garantia
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Garantia</DialogTitle>
            <p className="text-sm text-slate-500 pt-1">{descricao}</p>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Esta moto está com status &quot;em garantia&quot; mas não possui registro formal de garantia no sistema.
              Ao confirmar, o status será alterado para <strong>Montada / Disponível</strong>.
            </p>
            <Textarea
              placeholder="Observação (opcional)"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? 'Resolvendo...' : 'Confirmar Resolução'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
