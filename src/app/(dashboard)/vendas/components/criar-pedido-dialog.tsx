'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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

  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Criar Pedido de Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Novo Pedido de Venda</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto Disponível</Label>
              {/* Nativo: o <Select> do design system mostra o UUID quando value ≠ texto,
                  e a lista dele tem a largura do campo, o que cortava o nome da moto. */}
              <select
                value={motoId}
                onChange={e => setMotoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Selecionar moto</option>
                {motos.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.marca} {m.modelo} — {m.chassi} ({m.cor}) — {m.lojaNome}
                  </option>
                ))}
              </select>
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
