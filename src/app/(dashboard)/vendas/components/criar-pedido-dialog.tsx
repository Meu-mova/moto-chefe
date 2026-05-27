'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { criarPedidoVendaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string; cor: string; lojaNome: string }

type Props = { motos: Moto[]; papel: string }

export function CriarPedidoDialog({ motos, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCriar() {
    if (!motoId) return
    setLoading(true)
    try {
      await criarPedidoVendaAction(motoId, observacao)
      setOpen(false)
      setMotoId('')
      setObservacao('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Criar Pedido de Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Pedido de Venda</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto Disponível</Label>
              <Select value={motoId} onValueChange={v => setMotoId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motos.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.chassi} ({m.cor}) — {m.lojaNome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={loading || !motoId}>
              {loading ? 'Criando...' : 'Criar Pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
