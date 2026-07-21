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
import { VeiculoGarantiaLookup } from './veiculo-garantia-lookup'
import type { VeiculoGarantia } from '../buscar-veiculo-action'

type Modelo = { id: string; marca: string; modelo: string }
type Loja   = { id: string; nome: string }
type OS     = { id: string; descricao: string; motoId: string | null }

type Props = {
  ordens: OS[]
  papel: string
  modelos: Modelo[]
  lojas: Loja[]
  isAdmin: boolean
  lojaUsuarioNome: string | null
}

export function AbrirGarantiaDialog({ ordens, papel, modelos, lojas, isAdmin, lojaUsuarioNome }: Props) {
  const [open, setOpen] = useState(false)
  const [veiculo, setVeiculo] = useState<VeiculoGarantia | null>(null)
  const [osId, setOsId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataPedido, setDataPedido] = useState('')
  const [numeroPedidoFabrica, setNumeroPedidoFabrica] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookupKey, setLookupKey] = useState(0)

  const ordensDaMoto = ordens.filter(o => o.motoId === veiculo?.motoId)

  function resetForm() {
    setVeiculo(null); setOsId(''); setDescricao('')
    setDataPedido(''); setNumeroPedidoFabrica('')
    setLookupKey(k => k + 1)
  }

  async function handleAbrir() {
    if (!veiculo || !descricao || !dataPedido) return
    setLoading(true)
    try {
      await abrirGarantiaAction({
        motoId: veiculo.motoId,
        osId: osId || undefined,
        descricao,
        dataInicio: dataPedido,
        numeroPedidoFabrica: numeroPedidoFabrica || undefined,
      })
      toast.success('Garantia aberta! Prazo: 30 dias.')
      setOpen(false)
      resetForm()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir garantia')
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir Garantia</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Garantia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Veículo</Label>
              <VeiculoGarantiaLookup
                key={lookupKey}
                modelos={modelos}
                lojas={lojas}
                isAdmin={isAdmin}
                lojaUsuarioNome={lojaUsuarioNome}
                onVeiculoSelecionado={v => { setVeiculo(v); setOsId('') }}
              />
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
            <div className="space-y-2">
              <Label>Data do Pedido</Label>
              <Input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} />
              <p className="text-xs text-slate-400">O prazo de resolução é de 30 dias a partir desta data.</p>
            </div>
            <div className="space-y-2">
              <Label>Número do Pedido na Fábrica (opcional)</Label>
              <Input value={numeroPedidoFabrica} onChange={e => setNumeroPedidoFabrica(e.target.value)} placeholder="Ex: FAB-2026-001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleAbrir} disabled={loading || !veiculo || !descricao || !dataPedido}>
              {loading ? 'Abrindo...' : 'Abrir Garantia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
