'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Lock, XCircle } from 'lucide-react'
import { cancelarVendaCompletaAction } from '../actions'
import { travaDoCancelamentoDaVendaAction } from '../nfe-propria-actions'

type Props = {
  vendaId: string
  descricao: string
  /** Total já conciliado (cartão + PIX). Vira aviso: esse dinheiro será desvinculado. */
  valorRecebido?: number
  notaFiscalSaida?: string | null
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function CancelarVendaButton({ vendaId, descricao, valorRecebido = 0, notaFiscalSaida }: Props) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [trava, setTrava] = useState<string | null>(null)

  const temRecebimento = valorRecebido > 0.005

  async function abrir() {
    setOpen(true)
    setTrava(null)
    setConferindo(true)
    try {
      const t = await travaDoCancelamentoDaVendaAction(vendaId)
      setTrava(t.ok ? t.trava : `Não deu para conferir a NF de saída desta venda: ${t.error}`)
    } catch {
      setTrava('Não deu para conferir a NF de saída desta venda: feche e abra de novo.')
    } finally {
      setConferindo(false)
    }
  }

  async function handleConfirm() {
    if (!motivo.trim()) {
      toast.error('Informe o motivo do cancelamento')
      return
    }
    setLoading(true)
    try {
      const r = await cancelarVendaCompletaAction(vendaId, motivo)
      if ('trava' in r) {
        setTrava(r.trava)
        return
      }
      const desvinculados = (r?.cartao ?? 0) + (r?.pix ?? 0)
      toast.success(
        desvinculados > 0
          ? `Venda cancelada — ${desvinculados} recebimento(s) desvinculado(s), ${fmt(r.valor)} de volta como não conciliado`
          : 'Venda cancelada com sucesso',
      )
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
        onClick={abrir}
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
          {conferindo ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin text-teal-600" /> Conferindo a NF de saída da venda…
            </p>
          ) : trava ? (
            <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="flex items-center gap-1.5 font-semibold"><Lock size={14} /> Esta venda não pode ser cancelada agora</p>
              <p>{trava}</p>
            </div>
          ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Esta ação irá reverter a venda: a moto voltará ao showroom como disponível,
              o lançamento de caixa será removido, o pedido será cancelado e o registro
              da venda será apagado.
            </p>

            {temRecebimento && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="font-semibold">{fmt(valorRecebido)} já foram recebidos e conciliados.</span>{' '}
                Os lançamentos voltam a aparecer como não vinculados em Conciliação e PIX —
                o dinheiro continua no extrato. A devolução ao cliente precisa ser lançada
                como saída à parte.
              </p>
            )}

            {notaFiscalSaida && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="font-semibold">NF de saída {notaFiscalSaida} já emitida.</span>{' '}
                Cancelar aqui não cancela a nota na SEFAZ — isso precisa ser feito no Bling.
              </p>
            )}
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading || conferindo || !!trava}
            >
              {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
