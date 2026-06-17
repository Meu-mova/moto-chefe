'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { solicitarTransferenciaAction } from '../actions'

type Loja = { id: string; nome: string }
type Moto = { id: string; chassi: string; marca: string; modelo: string; lojaId: string }

type Props = {
  lojas: Loja[]
  motos: Moto[]
  lojaUsuarioId: string | null
  papel: string
}

export function SolicitarDialog({ lojas, motos, lojaUsuarioId, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [lojaDestinoId, setLojaDestinoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)
  const motosPermitidas = isAdmin
    ? motos
    : motos.filter(m => m.lojaId === lojaUsuarioId)

  const motoSelecionada = motosPermitidas.find(m => m.id === motoId)
  const lojasDestino = lojas.filter(l =>
    motoSelecionada ? l.id !== motoSelecionada.lojaId : true
  )

  function handleOpen() {
    setMotoId('')
    setLojaDestinoId('')
    setObservacao('')
    setOpen(true)
  }

  async function handleSolicitar() {
    if (!motoId || !lojaDestinoId) return
    setLoading(true)
    try {
      await solicitarTransferenciaAction(motoId, lojaDestinoId, observacao || undefined)
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao solicitar transferência')
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel)) return null

  return (
    <>
      <Button onClick={handleOpen}>Solicitar Transferência</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Transferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={v => { setMotoId(v ?? ''); setLojaDestinoId('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar moto" />
                </SelectTrigger>
                <SelectContent>
                  {motosPermitidas.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.chassi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loja Destino</Label>
              <Select value={lojaDestinoId} onValueChange={v => setLojaDestinoId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar destino" />
                </SelectTrigger>
                <SelectContent>
                  {lojasDestino.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder="Ex: cliente solicitou urgência"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSolicitar}
              disabled={loading || !motoId || !lojaDestinoId}
            >
              {loading ? 'Solicitando...' : 'Solicitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
