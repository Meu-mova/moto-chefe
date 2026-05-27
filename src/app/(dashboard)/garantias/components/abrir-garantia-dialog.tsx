'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { abrirGarantiaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string }
type OS = { id: string; descricao: string; motoId: string }
type Props = { motos: Moto[]; ordens: OS[]; papel: string }

export function AbrirGarantiaDialog({ motos, ordens, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [osId, setOsId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataPedidoPeca, setDataPedidoPeca] = useState('')
  const [numeroPedidoFabrica, setNumeroPedidoFabrica] = useState('')
  const [loading, setLoading] = useState(false)

  const ordensDaMoto = ordens.filter(o => o.motoId === motoId)

  function resetForm() {
    setMotoId(''); setOsId(''); setDescricao('')
    setDataInicio(''); setDataFim(''); setDataPedidoPeca(''); setNumeroPedidoFabrica('')
  }

  async function handleAbrir() {
    if (!motoId || !descricao || !dataInicio || !dataFim) return
    setLoading(true)
    try {
      await abrirGarantiaAction({
        motoId,
        osId: osId || undefined,
        descricao,
        dataInicio,
        dataFim,
        dataPedidoPeca: dataPedidoPeca || undefined,
        numeroPedidoFabrica: numeroPedidoFabrica || undefined,
      })
      setOpen(false)
      resetForm()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir garantia')
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir Garantia</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Garantia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={v => { setMotoId(v ?? ''); setOsId('') }}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.marca} {m.modelo} — {m.chassi}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ordensDaMoto.length > 0 && (
              <div className="space-y-2">
                <Label>OS Vinculada (opcional)</Label>
                <Select value={osId} onValueChange={v => setOsId(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    {ordensDaMoto.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do problema em garantia..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data Fim</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data Pedido da Peça (opcional)</Label>
              <Input type="date" value={dataPedidoPeca} onChange={e => setDataPedidoPeca(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Número do Pedido na Fábrica (opcional)</Label>
              <Input value={numeroPedidoFabrica} onChange={e => setNumeroPedidoFabrica(e.target.value)} placeholder="Ex: FAB-2024-001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleAbrir} disabled={loading || !motoId || !descricao || !dataInicio || !dataFim}>
              {loading ? 'Abrindo...' : 'Abrir Garantia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
