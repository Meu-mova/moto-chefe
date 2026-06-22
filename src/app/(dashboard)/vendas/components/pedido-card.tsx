'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { EfetivarDialog } from './efetivar-dialog'
import { cancelarPedidoAction } from '../actions'
import type { PedidoComDetalhes } from '@/lib/queries/vendas'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  efetivado: 'default',
  cancelado: 'secondary',
}

type Props = {
  pedido: PedidoComDetalhes
  papel: string
  usuarioId: string
  lojaIdUsuario: string | null
}

export function PedidoCard({ pedido: p, papel, usuarioId, lojaIdUsuario }: Props) {
  const [cancelarOpen, setCancelarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)

  const podeEfetivar = p.status === 'pendente' && ['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) &&
    (isAdmin || lojaIdUsuario === p.lojaId)

  const podeCancelar = p.status === 'pendente' && (
    isAdmin ||
    (papel === 'aux_adm' && lojaIdUsuario === p.lojaId) ||
    (papel === 'vendedor' && usuarioId === p.vendedorId && lojaIdUsuario === p.lojaId)
  )

  async function handleCancelar() {
    setLoading(true)
    try {
      await cancelarPedidoAction(p.id, observacao)
      setCancelarOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{p.marca} {p.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{p.chassi} · {p.cor}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusBadge[p.status] ?? 'secondary'}>
              {p.status === 'pendente' ? 'Pendente' : p.status === 'efetivado' ? 'Efetivado' : 'Cancelado'}
            </Badge>
            <span className="text-xs font-mono text-slate-400">#{p.numero}</span>
          </div>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{p.lojaNome}</span></p>
          <p>Vendedor: <span className="text-slate-700">{p.vendedorNome}</span></p>
          <p>Data: {p.dataPedido ? format(new Date(p.dataPedido), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</p>
          {p.observacao && <p className="italic">{p.observacao}</p>}
        </div>
        {(podeEfetivar || podeCancelar) && (
          <div className="flex gap-2 pt-1">
            {podeEfetivar && (
              <EfetivarDialog pedidoId={p.id} chassi={p.chassi} modelo={`${p.marca} ${p.modelo}`} />
            )}
            {podeCancelar && (
              <Button size="sm" variant="outline" onClick={() => setCancelarOpen(true)}>
                Cancelar Pedido
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar Pedido</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancelar} disabled={loading}>
              {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
