// src/app/(dashboard)/estoque/[id]/components/status-actions.tsx
'use client'
import { useState } from 'react'
import { hojeBrt } from '@/lib/data-venda'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  getTransicoesStatusPermitidas,
  getTransicoesDisponibilidadePermitidas,
  statusLabel,
  disponibilidadeLabel,
  type Status,
  type Disponibilidade,
} from '@/lib/estado-moto'
import { alterarStatusAction, alterarDisponibilidadeAction } from '../actions'
import { abrirGarantiaAction } from '../../../garantias/actions'

type Mecanico = { id: string; nome: string }

type Props = {
  motoId: string
  statusAtual: string
  disponibilidadeAtual: string | null
  papel: string
  lojaIdUsuario: string | null
  lojaIdMoto: string
  mecanicos: Mecanico[]
}

export function StatusActions({
  motoId, statusAtual, disponibilidadeAtual, papel, lojaIdUsuario, lojaIdMoto, mecanicos,
}: Props) {
  const [open, setOpen] = useState(false)
  const [alvo, setAlvo] = useState<{ tipo: 'status' | 'disponibilidade'; valor: string } | null>(null)
  const [observacao, setObservacao] = useState('')
  const [mecanicoId, setMecanicoId] = useState('')
  const [dataMontagem, setDataMontagem] = useState('')
  const [loading, setLoading] = useState(false)

  const [garantiaDescricao, setGarantiaDescricao] = useState('')
  const [garantiaDataPedido, setGarantiaDataPedido] = useState('')
  const [garantiaNumeroPedido, setGarantiaNumeroPedido] = useState('')

  const isMinhaLoja = lojaIdUsuario === lojaIdMoto

  const statusPermitidos = getTransicoesStatusPermitidas(statusAtual as Status, papel as any, isMinhaLoja)
  const dispPermitidas = getTransicoesDisponibilidadePermitidas(
    statusAtual as Status,
    disponibilidadeAtual as Disponibilidade | null,
    papel as any,
    isMinhaLoja,
  )

  const semAcoes = statusPermitidos.length === 0 && dispPermitidas.length === 0
  if (semAcoes) return <p className="text-sm text-slate-400">Sem ações disponíveis.</p>

  function abrirDialog(tipo: 'status' | 'disponibilidade', valor: string) {
    setAlvo({ tipo, valor })
    setMecanicoId('')
    setDataMontagem(hojeBrt())
    setObservacao('')
    setGarantiaDescricao('')
    setGarantiaDataPedido(hojeBrt())
    setGarantiaNumeroPedido('')
    setOpen(true)
  }

  const exigeMecanico = alvo?.tipo === 'status' && alvo?.valor === 'montada'
  const exigeGarantia = alvo?.tipo === 'status' && alvo?.valor === 'em_garantia'
  const podeConfirmar = exigeGarantia
    ? !!(garantiaDescricao && garantiaDataPedido)
    : !exigeMecanico || (!!mecanicoId && !!dataMontagem)

  async function handleConfirm() {
    if (!alvo || !podeConfirmar) return
    setLoading(true)
    try {
      if (exigeGarantia) {
        await abrirGarantiaAction({
          motoId,
          descricao: garantiaDescricao,
          dataInicio: garantiaDataPedido,
          dataPedidoPeca: garantiaDataPedido,
          numeroPedidoFabrica: garantiaNumeroPedido || undefined,
        })
        toast.success('Garantia aberta! Prazo: 30 dias.')
      } else if (alvo.tipo === 'status') {
        await alterarStatusAction(motoId, alvo.valor, observacao, mecanicoId || undefined, dataMontagem || undefined)
      } else {
        await alterarDisponibilidadeAction(motoId, alvo.valor, observacao)
      }
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const alvoLabel = alvo
    ? alvo.tipo === 'status'
      ? statusLabel[alvo.valor as Status]
      : disponibilidadeLabel[alvo.valor as Disponibilidade]
    : ''

  return (
    <>
      <div className="space-y-3">
        {statusPermitidos.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <div className="flex gap-2 flex-wrap">
              {statusPermitidos.map(s => (
                <Button key={s} variant="outline" size="sm" onClick={() => abrirDialog('status', s)}>
                  → {statusLabel[s]}
                </Button>
              ))}
            </div>
          </div>
        )}
        {dispPermitidas.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Disponibilidade</p>
            <div className="flex gap-2 flex-wrap">
              {dispPermitidas.map(d => (
                <Button key={d} variant="outline" size="sm" onClick={() => abrirDialog('disponibilidade', d)}>
                  → {disponibilidadeLabel[d]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar alteração</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Alterar {alvo?.tipo === 'status' ? 'status' : 'disponibilidade'} para{' '}
              <strong>{alvoLabel}</strong>?
            </p>

            {exigeGarantia && (
              <>
                <div className="space-y-2">
                  <Label>Descrição do Problema <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={garantiaDescricao}
                    onChange={e => setGarantiaDescricao(e.target.value)}
                    placeholder="Descreva o defeito ou problema em garantia..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data do Pedido <span className="text-red-500">*</span></Label>
                  <Input type="date" value={garantiaDataPedido} onChange={e => setGarantiaDataPedido(e.target.value)} />
                  <p className="text-xs text-slate-400">O prazo de resolução é de 30 dias a partir desta data.</p>
                </div>
                <div className="space-y-2">
                  <Label>Número do Pedido na Fábrica (opcional)</Label>
                  <Input
                    value={garantiaNumeroPedido}
                    onChange={e => setGarantiaNumeroPedido(e.target.value)}
                    placeholder="Ex: FAB-2026-001"
                  />
                </div>
              </>
            )}

            {exigeMecanico && (
              <>
                <div className="space-y-2">
                  <Label>
                    Mecânico responsável <span className="text-red-500">*</span>
                  </Label>
                  <Select value={mecanicoId} onValueChange={v => setMecanicoId(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar mecânico...">
                        {mecanicoId
                          ? (mecanicos.find(m => m.id === mecanicoId)?.nome ?? 'Mecânico selecionado')
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {mecanicos.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mecanicos.length === 0 && (
                    <p className="text-xs text-red-500">Nenhum mecânico cadastrado.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    Data da montagem <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={dataMontagem}
                    onChange={e => setDataMontagem(e.target.value)}
                  />
                </div>
              </>
            )}

            {!exigeGarantia && (
              <Textarea
                placeholder="Observação (opcional)"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={loading || !podeConfirmar}>
              {loading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
