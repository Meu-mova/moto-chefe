'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Truck } from 'lucide-react'
import { solicitarTransferenciaAction } from '../../transferencias/actions'

type Loja = { id: string; nome: string }

type Props = {
  motoId: string
  descricao: string
  lojaAtualId: string
  lojas: Loja[]
}

export function LogisticaButton({ motoId, descricao, lojaAtualId, lojas }: Props) {
  const [open, setOpen] = useState(false)
  const [lojaDestinoId, setLojaDestinoId] = useState('')
  const [loading, setLoading] = useState(false)

  const lojasDestino = lojas.filter(l => l.id !== lojaAtualId)

  function handleOpen() {
    setLojaDestinoId('')
    setOpen(true)
  }

  async function handleSolicitar() {
    if (!lojaDestinoId) return
    setLoading(true)
    try {
      await solicitarTransferenciaAction(motoId, lojaDestinoId, undefined)
      toast.success('Transferência solicitada!')
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao solicitar transferência')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Solicitar Transferência"
        onClick={handleOpen}
        className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
      >
        <Truck size={16} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Transferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{descricao}</p>
            <div className="space-y-2">
              <Label>Loja Destino</Label>
              <Select value={lojaDestinoId} onValueChange={v => setLojaDestinoId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar destino">
                    {lojaDestinoId ? (lojasDestino.find(l => l.id === lojaDestinoId)?.nome ?? 'Destino selecionado') : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {lojasDestino.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSolicitar} disabled={loading || !lojaDestinoId}>
              {loading ? 'Solicitando...' : 'Solicitar Transferência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
