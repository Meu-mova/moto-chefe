'use client'
import { useState } from 'react'
import { hojeBrt } from '@/lib/data-venda'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Printer } from 'lucide-react'
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
  verde:    'text-success',
  amarelo:  'text-warning',
  vermelho: 'text-destructive',
}

const urgenciaBadge: Record<NonNullable<Urgencia>, string> = {
  verde:    'border-success/50 text-success bg-success/10',
  amarelo:  'border-warning/50 text-warning bg-warning/10',
  vermelho: 'border-destructive/50 text-destructive bg-destructive/10',
}

function formatDate(d: unknown) {
  if (!d) return '—'
  return new Date(d as string).toLocaleDateString('pt-BR')
}

const STATUS_FABRICA_CLS: Record<string, string> = {
  'Aguardando Separação':          'bg-info/10 text-info border-info/30',
  'Aguardando Reposição':          'bg-warning/10 text-warning border-warning/30',
  'Em Separação':                  'bg-info/10 text-info border-info/30',
  'Em Exigência':                  'bg-destructive/10 text-destructive border-destructive/50',
  'Em auditoria':                  'bg-info/10 text-info border-info/30',
  'Em avaliação SAC':              'bg-info/10 text-info border-info/30',
  'Em avaliação do técnico':       'bg-info/10 text-info border-info/30',
  'Em conferência':                'bg-warning/10 text-warning border-warning/30',
  'Separado':                      'bg-info/10 text-info border-info/30',
  'Pedido enviado':                'bg-success/10 text-success border-success/30',
  'Entregue':                      'bg-success/15 text-success border-success/50',
  'Garantia concluída':            'bg-success/15 text-success border-success/50',
  'Aguardando Postagem Reversa':   'bg-warning/10 text-warning border-warning/30',
  'Aguardando devolução':          'bg-warning/10 text-warning border-warning/30',
  'Rejeitado':                     'bg-destructive/15 text-destructive border-destructive/50',
  'Cancelado':                     'bg-muted text-muted-foreground border-input',
}

const STATUS_FABRICA_CRITICOS = new Set(['Em Exigência', 'Rejeitado', 'Aguardando Postagem Reversa'])

export function GarantiaCard({ garantia: g, papel, lojaIdUsuario }: Props) {
  const [open, setOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [dataEncerramento, setDataEncerramento] = useState(hojeBrt())
  const [loading, setLoading] = useState(false)

  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)
  const isAuxAdm = papel === 'aux_adm'

  const podeEncerrar =
    g.status === 'ativa' &&
    (isAdmin || isAuxAdm)

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
            <p className="text-xs font-mono text-muted-foreground">{g.chassi}</p>
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

        <p className="text-sm text-foreground">{g.descricao}</p>

        {/* Status da fábrica */}
        {g.numeroPedidoFabrica && (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://motochefebrasil.store/clientes/trocas/detalhes/${g.numeroPedidoFabrica}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Pedido #{g.numeroPedidoFabrica}
            </a>
            {g.statusFabrica && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_FABRICA_CLS[g.statusFabrica] ?? 'bg-muted text-muted-foreground border-border'} ${STATUS_FABRICA_CRITICOS.has(g.statusFabrica) ? 'ring-1 ring-destructive/50' : ''}`}>
                {STATUS_FABRICA_CRITICOS.has(g.statusFabrica) && '⚠ '}
                {g.statusFabrica}
              </span>
            )}
            {!g.statusFabrica && (
              <span className="text-xs text-muted-foreground">status não sincronizado</span>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Loja: <span className="text-foreground">{g.lojaNome}</span></p>
          <p>Abertura: {formatDate(g.dataInicio)} — Prazo: {formatDate(g.dataFim)}</p>
          {g.dataEncerramento && <p>Encerrada em: <span className="text-foreground font-medium">{formatDate(g.dataEncerramento)}</span></p>}
          {g.dataPedidoPeca && <p>Pedido peça: {formatDate(g.dataPedidoPeca)}</p>}
          {g.statusFabricaSyncEm && (
            <p>Última sync: {new Date(g.statusFabricaSyncEm as unknown as string).toLocaleString('pt-BR')}</p>
          )}
        </div>

        {g.status === 'ativa' && dias !== null && urgencia && (
          <p className={`text-xs font-medium ${urgenciaText[urgencia]}`}>
            {dias} {dias === 1 ? 'dia decorrido' : 'dias decorridos'} · {Math.max(0, 30 - dias)} dias restantes
          </p>
        )}

        {podeEncerrar && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Encerrar Garantia</Button>
        )}

        {/* Só depois de encerrada: o comprovante afirma que o atendimento acabou.
            Link e não Button porque a página de impressão dispara window.print()
            sozinha ao abrir. */}
        {g.status === 'encerrada' && (
          <a
            href={`/garantias/${g.id}/comprovante`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-ring rounded-md px-3 py-1.5 transition-colors"
          >
            <Printer size={13} /> Comprovante de encerramento
          </a>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar Garantia</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              {g.descricao} · Abertura: {formatDate(g.dataInicio)}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data de encerramento <span className="text-destructive">*</span></Label>
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
