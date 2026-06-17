'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { encerrarGarantiaAction } from '../actions'
import type { GarantiaComDetalhes } from '@/lib/queries/garantias'

type Props = {
  garantia: GarantiaComDetalhes
  papel: string
  lojaIdUsuario: string | null
}

function diasDecorridos(dataInicio: unknown): number | null {
  if (!dataInicio) return null
  const ms = Date.now() - new Date(dataInicio as string).getTime()
  return Math.floor(ms / 86400000)
}

type Urgencia = 'verde' | 'amarelo' | 'vermelho' | null

function calcUrgencia(dias: number | null): Urgencia {
  if (dias === null) return null
  if (dias < 10)  return 'verde'
  if (dias < 20)  return 'amarelo'
  return 'vermelho'
}

const urgenciaBorder: Record<NonNullable<Urgencia>, string> = {
  verde:    'border-l-4 border-l-green-400',
  amarelo:  'border-l-4 border-l-amber-400',
  vermelho: 'border-l-4 border-l-red-500',
}

const urgenciaText: Record<NonNullable<Urgencia>, string> = {
  verde:    'text-green-700',
  amarelo:  'text-amber-700',
  vermelho: 'text-red-700',
}

const urgenciaBadge: Record<NonNullable<Urgencia>, string> = {
  verde:    'border-green-300 text-green-700 bg-green-50',
  amarelo:  'border-amber-300 text-amber-700 bg-amber-50',
  vermelho: 'border-red-300 text-red-700 bg-red-50',
}

function formatDate(d: unknown) {
  if (!d) return '—'
  return new Date(d as string).toLocaleDateString('pt-BR')
}

export function GarantiaCard({ garantia: g, papel, lojaIdUsuario }: Props) {
  const [open, setOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [dataEncerramento, setDataEncerramento] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)

  const podeEncerrar =
    g.status === 'ativa' &&
    (isAdmin || (papel === 'aux_adm' && lojaIdUsuario === g.lojaId))

  const dias = g.status === 'ativa' ? diasDecorridos(g.dataInicio) : null
  const urgencia = calcUrgencia(dias)

  async function handleEncerrar() {
    if (!dataEncerramento) return
    setLoading(true)
    try {
      await encerrarGarantiaAction(g.id, observacao, dataEncerramento)
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao encerrar garantia')
    } finally {
      setLoading(false)
    }
  }

  const borderClass = urgencia ? urgenciaBorder[urgencia] : ''

  return (
    <Card className={borderClass}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{g.marca} {g.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{g.chassi}</p>
          </div>
          {g.status === 'ativa' && urgencia
            ? (
              <Badge variant="outline" className={urgenciaBadge[urgencia]}>
                {urgencia === 'vermelho' ? 'Urgente' : urgencia === 'amarelo' ? 'Atenção' : 'Ativa'}
              </Badge>
            )
            : (
              <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
                {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
              </Badge>
            )
          }
        </div>

        <p className="text-sm text-slate-700">{g.descricao}</p>

        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{g.lojaNome}</span></p>
          <p>Abertura: {formatDate(g.dataInicio)} — Prazo: {formatDate(g.dataFim)}</p>
          {g.dataEncerramento && <p>Encerrada em: <span className="text-slate-700 font-medium">{formatDate(g.dataEncerramento)}</span></p>}
          {g.dataPedidoPeca && <p>Pedido peça: {formatDate(g.dataPedidoPeca)}</p>}
          {g.numeroPedidoFabrica && <p>Pedido fábrica: <span className="text-slate-700">{g.numeroPedidoFabrica}</span></p>}
        </div>

        {g.status === 'ativa' && dias !== null && urgencia && (
          <p className={`text-xs font-medium ${urgenciaText[urgencia]}`}>
            {dias} {dias === 1 ? 'dia decorrido' : 'dias decorridos'} · {Math.max(0, 30 - dias)} dias restantes
          </p>
        )}

        {podeEncerrar && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Encerrar Garantia</Button>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar Garantia</DialogTitle>
            <p className="text-sm text-slate-500 pt-1">
              {g.descricao} · Abertura: {formatDate(g.dataInicio)}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data de encerramento <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dataEncerramento}
                onChange={e => setDataEncerramento(e.target.value)}
              />
            </div>
            <Textarea
              placeholder={isAdmin ? 'Motivo do encerramento forçado (obrigatório para admin)' : 'Observação (opcional)'}
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEncerrar}
              disabled={loading || !dataEncerramento || (isAdmin && !observacao)}
            >
              {loading ? 'Encerrando...' : 'Confirmar Encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
