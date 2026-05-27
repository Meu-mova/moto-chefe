'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { encerrarGarantiaAction } from '../actions'
import type { GarantiaComDetalhes } from '@/lib/queries/garantias'

type Props = {
  garantia: GarantiaComDetalhes
  papel: string
  lojaIdUsuario: string | null
}

export function GarantiaCard({ garantia: g, papel, lojaIdUsuario }: Props) {
  const [open, setOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const podeEncerrar =
    g.status === 'ativa' &&
    (papel === 'admin_geral' || (papel === 'aux_adm' && lojaIdUsuario === g.lojaId))

  async function handleEncerrar() {
    setLoading(true)
    try {
      await encerrarGarantiaAction(g.id, observacao)
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar garantia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{g.marca} {g.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{g.chassi}</p>
          </div>
          <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
            {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{g.descricao}</p>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{g.lojaNome}</span></p>
          <p>Período: {g.dataInicio} → {g.dataFim}</p>
          {g.dataPedidoPeca && <p>Pedido peça: {g.dataPedidoPeca}</p>}
          {g.numeroPedidoFabrica && <p>Pedido fábrica: <span className="text-slate-700">{g.numeroPedidoFabrica}</span></p>}
        </div>
        {podeEncerrar && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Encerrar Garantia</Button>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Encerrar Garantia</DialogTitle></DialogHeader>
          <Textarea
            placeholder={papel === 'admin_geral' ? 'Motivo do encerramento forçado (obrigatório para admin)' : 'Observação (opcional)'}
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEncerrar}
              disabled={loading || (papel === 'admin_geral' && !observacao)}
            >
              {loading ? 'Encerrando...' : 'Confirmar Encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
