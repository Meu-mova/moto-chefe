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

const STATUS_FABRICA_CLS: Record<string, string> = {
  'Aguardando Separação':          'bg-blue-50 text-blue-700 border-blue-200',
  'Aguardando Reposição':          'bg-amber-50 text-amber-700 border-amber-200',
  'Em Separação':                  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Em Exigência':                  'bg-red-50 text-red-700 border-red-300',
  'Em auditoria':                  'bg-purple-50 text-purple-700 border-purple-200',
  'Em avaliação SAC':              'bg-purple-50 text-purple-700 border-purple-200',
  'Em avaliação do técnico':       'bg-purple-50 text-purple-700 border-purple-200',
  'Em conferência':                'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Separado':                      'bg-teal-50 text-teal-700 border-teal-200',
  'Pedido enviado':                'bg-green-50 text-green-700 border-green-200',
  'Entregue':                      'bg-green-100 text-green-800 border-green-300',
  'Garantia concluída':            'bg-green-100 text-green-800 border-green-300',
  'Aguardando Postagem Reversa':   'bg-orange-50 text-orange-700 border-orange-200',
  'Aguardando devolução':          'bg-orange-50 text-orange-700 border-orange-200',
  'Rejeitado':                     'bg-red-100 text-red-800 border-red-400',
  'Cancelado':                     'bg-gray-100 text-gray-600 border-gray-300',
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

        {/* Status da fábrica */}
        {g.numeroPedidoFabrica && (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://motochefebrasil.store/clientes/trocas/detalhes/${g.numeroPedidoFabrica}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
            >
              Pedido #{g.numeroPedidoFabrica}
            </a>
            {g.statusFabrica && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATUS_FABRICA_CLS[g.statusFabrica] ?? 'bg-slate-50 text-slate-600 border-slate-200'} ${STATUS_FABRICA_CRITICOS.has(g.statusFabrica) ? 'ring-1 ring-red-400' : ''}`}>
                {STATUS_FABRICA_CRITICOS.has(g.statusFabrica) && '⚠ '}
                {g.statusFabrica}
              </span>
            )}
            {!g.statusFabrica && (
              <span className="text-xs text-slate-400">status não sincronizado</span>
            )}
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{g.lojaNome}</span></p>
          <p>Abertura: {formatDate(g.dataInicio)} — Prazo: {formatDate(g.dataFim)}</p>
          {g.dataEncerramento && <p>Encerrada em: <span className="text-slate-700 font-medium">{formatDate(g.dataEncerramento)}</span></p>}
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-md px-3 py-1.5 transition-colors"
          >
            <Printer size={13} /> Comprovante de encerramento
          </a>
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
