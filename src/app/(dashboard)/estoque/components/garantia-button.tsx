'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ShieldAlert } from 'lucide-react'
import { abrirGarantiaAction } from '../../garantias/actions'

type Props = {
  motoId: string
  descricao: string
  showLabel?: boolean
  disabled?: boolean
  /** Troca o botão padrão por outro (ex.: os botões do painel da venda). */
  gatilho?: (abrir: () => void) => React.ReactNode
}

export function GarantiaButton({ motoId, descricao, showLabel, disabled, gatilho }: Props) {
  const [open, setOpen] = useState(false)
  const [descricaoGarantia, setDescricaoGarantia] = useState('')
  const [dataPedido, setDataPedido] = useState('')
  const [numeroPedidoFabrica, setNumeroPedidoFabrica] = useState('')
  const [loading, setLoading] = useState(false)

  function resetForm() {
    setDescricaoGarantia('')
    setDataPedido('')
    setNumeroPedidoFabrica('')
  }

  async function handleAbrir() {
    if (!descricaoGarantia || !dataPedido) return
    setLoading(true)
    try {
      await abrirGarantiaAction({
        motoId,
        descricao: descricaoGarantia,
        dataInicio: dataPedido,
        dataPedidoPeca: dataPedido,
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

  return (
    <>
      {gatilho ? gatilho(() => { if (!disabled) setOpen(true) }) : (
      <Button
        variant={showLabel ? 'outline' : 'ghost'}
        size={showLabel ? 'sm' : 'icon'}
        title={disabled ? 'Moto ainda não montada — não é possível abrir garantia' : 'Abrir Garantia'}
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={showLabel
          ? 'h-8 gap-1.5 text-xs border-orange-300 text-orange-600 hover:bg-orange-50'
          : 'h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50'}
      >
        <ShieldAlert size={showLabel ? 14 : 16} />
        {showLabel && 'Garantia'}
      </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Garantia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{descricao}</p>
            <div className="space-y-2">
              <Label>Descrição do Problema</Label>
              <Textarea
                value={descricaoGarantia}
                onChange={e => setDescricaoGarantia(e.target.value)}
                placeholder="Descreva o defeito ou problema em garantia..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Data do Pedido</Label>
              <Input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} />
              <p className="text-xs text-slate-400">O prazo de resolução é de 30 dias a partir desta data.</p>
            </div>
            <div className="space-y-2">
              <Label>Número do Pedido na Fábrica (opcional)</Label>
              <Input
                value={numeroPedidoFabrica}
                onChange={e => setNumeroPedidoFabrica(e.target.value)}
                placeholder="Ex: FAB-2026-001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleAbrir}
              disabled={loading || !descricaoGarantia || !dataPedido}
            >
              {loading ? 'Abrindo...' : 'Abrir Garantia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
