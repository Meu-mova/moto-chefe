'use client'
import { useState } from 'react'
import { hojeBrt } from '@/lib/data-venda'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { encerrarGarantiaAction } from '@/app/(dashboard)/garantias/actions'

type Props = {
  garantiaId: string
  descricao: string
  dataInicio: string
  papel: string
  lojaIdUsuario: string | null
  lojaIdGarantia: string
}

export function EncerrarGarantiaButton({ garantiaId, descricao, dataInicio, papel, lojaIdUsuario, lojaIdGarantia }: Props) {
  const [open, setOpen] = useState(false)
  const [dataEncerramento, setDataEncerramento] = useState(hojeBrt())
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)

  async function handleEncerrar() {
    if (!dataEncerramento) return
    setLoading(true)
    try {
      await encerrarGarantiaAction(garantiaId, observacao, dataEncerramento)
      setOpen(false)
      toast.success('Garantia encerrada.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar garantia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Encerrar Garantia
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar Garantia</DialogTitle>
            <p className="text-sm text-slate-500 pt-1">
              {descricao} · Abertura: {dataInicio}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data de encerramento <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dataEncerramento}
                onChange={e => setDataEncerramento(e.target.value)}
              />
            </div>
            <Textarea
              placeholder={isAdmin ? 'Motivo do encerramento forçado (obrigatório para admin)' : 'Observação (opcional)'}
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEncerrar}
              disabled={loading || !dataEncerramento || (isAdmin && !observacao)}
            >
              {loading ? 'Encerrando...' : 'Confirmar Encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
