'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cancelarOSAction } from '../../actions'

type Props = {
  osId: string
  numero: number | null
  /** OS com pagamento lançado ou já conciliada não pode ser cancelada (não há estorno de caixa). */
  bloqueio: string | null
}

export function CancelarOSButton({ osId, numero, bloqueio }: Props) {
  const [open, setOpen]   = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pending, start]  = useTransition()
  const router = useRouter()

  function cancelar() {
    if (motivo.trim().length < 5) {
      toast.error('Descreva o motivo do cancelamento'); return
    }
    start(async () => {
      try {
        await cancelarOSAction(osId, motivo)
        toast.success(`OS #${numero ?? ''} cancelada`)
        setOpen(false)
        setMotivo('')
        router.refresh()
      } catch (e: any) {
        toast.error(e.message ?? 'Erro ao cancelar')
      }
    })
  }

  // Botão de verdade, não <span> inerte: no celular não existe hover, então sem
  // o clique o usuário não teria como descobrir por que não consegue cancelar.
  if (bloqueio) {
    return (
      <button
        type="button"
        onClick={() => toast.info(bloqueio)}
        title={bloqueio}
        className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-input px-3 text-sm transition-colors sm:h-auto sm:py-1.5 text-muted-foreground"
      >
        <Ban size={15} className="shrink-0" /> <span>Cancelar<span className="hidden sm:inline"> OS</span></span>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Cancelar OS"
        className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-input px-3 text-sm transition-colors sm:h-auto sm:py-1.5 text-warning hover:border-warning hover:bg-warning/10"
      >
        <Ban size={15} className="shrink-0" /> <span>Cancelar<span className="hidden sm:inline"> OS</span></span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar OS #{numero ?? ''}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A OS fica registrada como cancelada e não pode mais ser editada. Ela deixa de contar
              no faturamento e nas comissões.
            </p>
            <Label htmlFor="motivo-cancelamento">Motivo do cancelamento</Label>
            <Textarea
              id="motivo-cancelamento"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente desistiu do serviço"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancelar} disabled={pending}>
              {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
