'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { MotoStatusIcon } from '@/components/moto-status-icon'
import { aceitarTransferenciaAction, recusarTransferenciaAction } from '../actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export type TransferenciaCardData = {
  id: string
  status: 'pendente' | 'aceita' | 'recusada'
  dataSolicitacao: Date | string | null
  dataResposta: Date | string | null
  observacao: string | null
  chassi: string
  modelo: string
  cor: string | null
  motoStatus: string
  lojaOrigemId: string
  lojaOrigemNome: string
  lojaDestinoId: string
  lojaDestinoNome: string
  solicitadoPorNome: string
  respondidoPorNome: string | null
}

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  aceita:   'default',
  recusada: 'destructive',
}

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  aceita:   'Aceita',
  recusada: 'Recusada',
}

type Props = {
  transferencia: TransferenciaCardData
  papel: string
  lojaIdUsuario: string | null
}

export function TransferenciaCard({ transferencia: t, papel, lojaIdUsuario }: Props) {
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao]   = useState('')
  const [loading, setLoading]         = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)

  const podeResponder =
    t.status === 'pendente' &&
    (isAdmin || (papel === 'aux_adm' && lojaIdUsuario === t.lojaDestinoId))

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
            <p className="font-medium text-sm">{t.modelo}</p>
            <p className="text-xs font-mono text-muted-foreground">
              {t.chassi}{t.cor ? ` · ${t.cor}` : ''}
            </p>
            {t.status === 'pendente' && (
              <div className="mt-1">
                <MotoStatusIcon status={t.motoStatus} />
              </div>
            )}
          </div>
          <Badge variant={statusBadge[t.status] ?? 'secondary'}>
            {statusLabel[t.status] ?? t.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            De: <span className="text-foreground">{t.lojaOrigemNome}</span>
            {' → '}
            Para: <span className="text-foreground">{t.lojaDestinoNome}</span>
          </p>
          <p>
            Solicitado por <span className="text-foreground">{t.solicitadoPorNome}</span> em {dataFormatada}
          </p>
          {t.respondidoPorNome && t.dataResposta && (
            <p>
              {t.status === 'aceita' ? 'Aprovado' : 'Recusado'} por{' '}
              <span className="text-foreground">{t.respondidoPorNome}</span>{' '}
              em {format(new Date(t.dataResposta), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          )}
          {t.observacao && <p className="italic">{t.observacao}</p>}
        </div>
        {podeResponder && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleAceitar} disabled={loading}>
              Aceitar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRecusarOpen(true)} disabled={loading}>
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
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRecusar} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
