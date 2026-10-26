'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CalendarX } from 'lucide-react'
import { cancelarReservaAction } from '../../vendas/actions'

type Props = {
  reservaId: string
  /** Moto, para o cabeçalho do dialog. */
  descricao: string
  clienteNome: string | null
  valorEntrada: string | null
  /** Na tabela do estoque o botão é só ícone; na página da moto vem com texto. */
  showLabel?: boolean
}

const fmt = (v: string | null) =>
  v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null

export function CancelarReservaButton({ reservaId, descricao, clienteNome, valorEntrada, showLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  const entrada = fmt(valorEntrada)

  async function confirmar() {
    setLoading(true)
    try {
      await cancelarReservaAction(reservaId, motivo)
      toast.success('Reserva cancelada — a moto voltou para venda.')
      setOpen(false)
      setMotivo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar a reserva')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size={showLabel ? 'sm' : 'icon'}
        onClick={() => setOpen(true)}
        title="Cancelar reserva"
        className={showLabel
          ? 'h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive'
          : 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'}
      >
        <CalendarX size={showLabel ? 14 : 16} />
        {showLabel && 'Cancelar reserva'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{descricao}</p>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              <p><span className="text-muted-foreground">Cliente:</span> <b>{clienteNome || '—'}</b></p>
              {entrada && <p><span className="text-muted-foreground">Entrada:</span> <b>{entrada}</b></p>}
            </div>

            <p className="text-sm text-muted-foreground">
              A moto volta a ficar disponível para venda e a reserva fica registrada como
              cancelada.
            </p>
            <p className="text-sm text-warning">
              O sistema <b>não devolve a entrada</b> — a reserva nunca lançou esse valor no
              caixa. Se o cliente for reembolsado, o acerto é por fora.
            </p>

            <Textarea
              placeholder="Motivo do cancelamento (obrigatório) — ex.: cliente desistiu, financiamento negado…"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Voltar
            </Button>
            <Button
              onClick={confirmar}
              variant="destructive"
              disabled={loading || motivo.trim().length < 3}
            >
              {loading ? 'Cancelando…' : 'Cancelar reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
