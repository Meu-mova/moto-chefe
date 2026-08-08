'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { EfetivarDialog } from './efetivar-dialog'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import { cancelarPedidoAction } from '../actions'
import type { PedidoComDetalhes } from '@/lib/queries/vendas'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bike, User, Store, CalendarDays, Hash, X, CheckCheck } from 'lucide-react'

const STATUS_CONFIG = {
  pendente:  { label: 'Pendente',  cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  efetivado: { label: 'Efetivado', cls: 'border-green-300 bg-green-50 text-green-700' },
  cancelado: { label: 'Cancelado', cls: 'border-slate-300 bg-slate-50 text-slate-500' },
}

type Props = {
  pedido: PedidoComDetalhes
  papel: string
  usuarioId: string
  lojaIdUsuario: string | null
  /** Origens ativas do grupo — a venda só efetiva com uma escolhida. */
  origens: OrigemParaEscolher[]
}

export function PedidoCard({ pedido: p, papel, usuarioId, lojaIdUsuario, origens }: Props) {
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

  const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.cancelado

  return (
    <>
      <div className={`rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
        p.status === 'cancelado' ? 'opacity-60' : ''
      }`}>
        {/* Faixa de status no topo */}
        <div className={`h-1 w-full ${
          p.status === 'pendente'  ? 'bg-amber-400' :
          p.status === 'efetivado' ? 'bg-green-400' : 'bg-slate-300'
        }`} />

        <div className="p-4 space-y-3">
          {/* Cabeçalho: modelo + número */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 bg-slate-100 rounded-lg shrink-0">
                <Bike size={16} className="text-slate-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                  {p.marca} {p.modelo}
                </p>
                <p className="text-xs font-mono text-slate-400 truncate">{p.chassi} · {p.cor}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.cls}`}>
                {cfg.label}
              </span>
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-0.5">
                <Hash size={10} />{p.numero}
              </span>
            </div>
          </div>

          {/* Infos em grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Store size={12} className="shrink-0 text-slate-400" />
              <span className="truncate">{p.lojaNome}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <User size={12} className="shrink-0 text-slate-400" />
              <span className="truncate">{p.vendedorNome}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 col-span-2">
              <CalendarDays size={12} className="shrink-0 text-slate-400" />
              <span>{p.dataPedido ? format(new Date(p.dataPedido), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}</span>
            </div>
            {p.observacao && (
              <div className="col-span-2 text-slate-400 italic truncate" title={p.observacao}>
                "{p.observacao}"
              </div>
            )}
          </div>

          {/* Ações */}
          {(podeEfetivar || podeCancelar) && (
            <div className="flex gap-2 pt-1 border-t border-slate-100">
              {podeEfetivar && (
                <EfetivarDialog pedidoId={p.id} chassi={p.chassi} modelo={`${p.marca} ${p.modelo}`} origens={origens} />
              )}
              {podeCancelar && (
                <Button size="sm" variant="ghost"
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 gap-1 text-xs"
                  onClick={() => setCancelarOpen(true)}>
                  <X size={13} /> Cancelar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar Pedido #{p.numero}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">{p.marca} {p.modelo} · {p.chassi}</p>
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
    </>
  )
}
