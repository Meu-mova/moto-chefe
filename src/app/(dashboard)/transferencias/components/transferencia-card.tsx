'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { aceitarTransferenciaAction, recusarTransferenciaAction } from '../actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Shared shape that both listarTransferenciasPorLoja and listarTodasTransferencias provide
export type TransferenciaCardData = {
  id: string
  status: 'pendente' | 'aceita' | 'recusada'
  dataSolicitacao: Date | string | null
  observacao: string | null
  chassi: string
  marca: string
  modelo: string
  lojaOrigemNome: string
  lojaDestinoId: string
  solicitadoPorNome: string
  cor?: string | null
  lojaOrigemId?: string | null
}

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  aceita: 'default',
  recusada: 'destructive',
}

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  recusada: 'Recusada',
}

type Props = {
  transferencia: TransferenciaCardData
  lojaDestinoNome: string
  papel: string
  lojaIdUsuario: string | null
  lojaDestinoId: string
}

export function TransferenciaCard({ transferencia: t, lojaDestinoNome, papel, lojaIdUsuario, lojaDestinoId }: Props) {
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const podeResponder =
    t.status === 'pendente' &&
    (papel === 'admin_geral' || (papel === 'aux_adm' && lojaIdUsuario === lojaDestinoId))

  async function handleAceitar() {
    setLoading(true)
    try {
      await aceitarTransferenciaAction(t.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aceitar transferência')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecusar() {
    setLoading(true)
    try {
      await recusarTransferenciaAction(t.id, observacao)
      setRecusarOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar transferência')
    } finally {
      setLoading(false)
    }
  }

  const dataFormatada = t.dataSolicitacao
    ? format(new Date(t.dataSolicitacao), 'dd/MM/yyyy', { locale: ptBR })
    : '—'

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{t.marca} {t.modelo}</p>
            <p className="text-xs font-mono text-slate-500">
              {t.chassi}{t.cor ? ` · ${t.cor}` : ''}
            </p>
          </div>
          <Badge variant={statusBadge[t.status] ?? 'secondary'}>
            {statusLabel[t.status] ?? t.status}
          </Badge>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>
            De: <span className="text-slate-700">{t.lojaOrigemNome}</span>
            {' → '}
            Para: <span className="text-slate-700">{lojaDestinoNome}</span>
          </p>
          <p>
            Solicitado por <span className="text-slate-700">{t.solicitadoPorNome}</span> em {dataFormatada}
          </p>
          {t.observacao && <p className="italic">{t.observacao}</p>}
        </div>
        {podeResponder && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleAceitar} disabled={loading}>
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRecusarOpen(true)}
              disabled={loading}
            >
              Recusar
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar Transferência</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da recusa (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRecusar} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
