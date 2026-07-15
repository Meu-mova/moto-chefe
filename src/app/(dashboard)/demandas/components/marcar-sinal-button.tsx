'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { atualizarSinalDemandaAction } from '../actions'

type Props = {
  demandaId: string
  sinalRecebido: boolean
  valorSinal: string | null
  isAdmin: boolean
}

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MarcarSinalButton({ demandaId, sinalRecebido, valorSinal, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [pending, startTransition] = useTransition()

  function marcar() {
    const v = valor.trim() ? parseFloat(valor.replace(',', '.')) : null
    startTransition(async () => {
      try {
        await atualizarSinalDemandaAction(demandaId, true, v)
        toast.success('Demanda marcada como prioridade')
        setOpen(false)
        setValor('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar sinal')
      }
    })
  }

  function desmarcar() {
    startTransition(async () => {
      try {
        await atualizarSinalDemandaAction(demandaId, false, null)
        toast.success('Prioridade removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao desmarcar')
      }
    })
  }

  if (sinalRecebido) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-2 py-1">
          Prioridade{valorSinal ? ` · ${fmt(valorSinal)}` : ''}
        </span>
        {isAdmin && (
          <button
            onClick={desmarcar}
            disabled={pending}
            className="text-xs text-slate-400 hover:text-red-500 underline"
          >
            desmarcar
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Marcar sinal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recebimento prévio (sinal)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Marcar essa demanda como prioridade — o cliente já deu um sinal/recebimento prévio.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Valor do sinal (opcional)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={e => setValor(e.target.value)}
              />
            </div>
            <Button onClick={marcar} disabled={pending} className="w-full">
              {pending ? 'Salvando…' : 'Confirmar prioridade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
