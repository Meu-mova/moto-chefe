'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Link2, Link2Off, Loader2, CheckCircle2, Search } from 'lucide-react'
import { buscarVendasParaVincular, buscarVendaManual, vincularVendaAction, desvincularVendaAction } from '../actions'

type Venda = Awaited<ReturnType<typeof buscarVendasParaVincular>>[number]
type PgtoItem = { tipo: string; valor: number | string; operadora?: string; parcelas?: number; autorizacao?: string }

const TIPO_CARTAO_LABEL: Record<string, string> = {
  cartao_credito: 'Crédito',
  cartao_debito:  'Débito',
  link_pagamento: 'Link',
}

type Props = {
  conciliacaoId: string
  dataRef: string
  valorRef: number
  vendaVinculada?: { id: string; numero: number; clienteNome: string; valor: string } | null
  tipoVinculado?: 'moto' | 'peca' | 'os'
}

export function VincularVendaButton({ conciliacaoId, dataRef, valorRef, vendaVinculada, tipoVinculado }: Props) {
  const [open, setOpen]               = useState(false)
  const [vendas, setVendas]           = useState<Venda[]>([])
  const [carregando, setCarregando]   = useState(false)
  const [pending, startTransition]    = useTransition()

  const [buscaQuery, setBuscaQuery]           = useState('')
  const [buscaResultados, setBuscaResultados] = useState<Venda[]>([])
  const [buscandoManual, setBuscandoManual]   = useState(false)
  const [buscouManual, setBuscouManual]       = useState(false)

  async function abrirModal() {
    setOpen(true)
    setBuscaQuery('')
    setBuscaResultados([])
    setBuscouManual(false)
    setCarregando(true)
    try {
      const lista = await buscarVendasParaVincular(valorRef)
      setVendas(lista)
    } finally {
      setCarregando(false)
    }
  }

  async function buscarManual() {
    if (!buscaQuery.trim()) return
    setBuscandoManual(true)
    setBuscouManual(false)
    try {
      const res = await buscarVendaManual(buscaQuery)
      setBuscaResultados(res)
      setBuscouManual(true)
    } finally {
      setBuscandoManual(false)
    }
  }

  function vincular(alvoId: string, tipo: 'moto' | 'peca' | 'os') {
    startTransition(async () => {
      try {
        await vincularVendaAction(conciliacaoId, alvoId, tipo)
        toast.success('Venda vinculada')
        setOpen(false)
      } catch {
        toast.error('Erro ao vincular')
      }
    })
  }

  function desvincular() {
    startTransition(async () => {
      try {
        await desvincularVendaAction(conciliacaoId)
        toast.success('Vínculo removido')
      } catch {
        toast.error('Erro ao desvincular')
      }
    })
  }

  function renderVenda(v: Venda, force = false) {
    const pgtos = (v.pagamentos as PgtoItem[] | null) ?? []
    const pgtoCartao = pgtos.filter(p => p.tipo in TIPO_CARTAO_LABEL)

    return (
      <button
        key={v.id}
        onClick={() => vincular(v.id, v.tipo)}
        disabled={pending}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
          force
            ? 'border-warning/30 hover:border-warning/50 hover:bg-warning/10'
            : 'border-border hover:border-info/50 hover:bg-info/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">
            {v.tipo === 'peca' && (
              <span className="text-xs font-semibold text-info bg-info/10 rounded px-1.5 py-0.5 mr-1.5">PA</span>
            )}
            {v.tipo === 'os' && (
              <span className="text-xs font-semibold text-info bg-info/10 rounded px-1.5 py-0.5 mr-1.5">OS</span>
            )}
            {v.tipo === 'os' ? `OS #${v.numero}` : `Venda #${v.numero}`} — {v.clienteNome}
          </span>
          <span className="font-semibold text-foreground">
            {v.valor ? parseFloat(v.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {v.dataVenda
            ? new Date(v.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'}
          {' · '}{v.formaPagamento}
        </div>
        {pgtoCartao.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {pgtoCartao.map((p, i) => (
              <span
                key={i}
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  force ? 'bg-warning/15 text-warning' : 'bg-info/15 text-info'
                }`}
              >
                {TIPO_CARTAO_LABEL[p.tipo]}
                {p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''}{' '}
                {parseFloat(String(p.valor)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                {p.autorizacao ? ` · ${p.autorizacao}` : ''}
                {p.operadora ? ` · ${p.operadora}` : ''}
              </span>
            ))}
          </div>
        )}
      </button>
    )
  }

  if (vendaVinculada) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-success font-medium">
          <CheckCircle2 size={12} />
          {tipoVinculado === 'peca' && (
            <span className="text-xs font-semibold text-info bg-info/10 rounded px-1 py-0.5">PA</span>
          )}
          {tipoVinculado === 'os' && (
            <span className="text-xs font-semibold text-info bg-info/10 rounded px-1 py-0.5">OS</span>
          )}
          #{vendaVinculada.numero} — {vendaVinculada.clienteNome.split(' ')[0]}
        </span>
        <button
          onClick={desvincular}
          disabled={pending}
          title="Desvincular"
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Link2Off size={12} />}
        </button>
      </div>
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={abrirModal}>
        <Link2 size={12} className="mr-1" /> Vincular
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular a uma venda</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Recebimento de{' '}
              <span className="font-semibold">{valorRef.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              {' '}em {new Date(dataRef + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </DialogHeader>

          {/* ── Sugestões automáticas ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Sugestões por valor
            </p>

            {carregando && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!carregando && vendas.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma venda com cartão no valor exato encontrada.
              </p>
            )}

            {!carregando && vendas.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {vendas.map(v => renderVenda(v, false))}
              </div>
            )}
          </div>

          {/* ── Forçar vínculo ── */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Forçar vínculo
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Pesquise pelo número da venda ou nome do cliente para vincular manualmente.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={buscaQuery}
                onChange={e => { setBuscaQuery(e.target.value); setBuscouManual(false) }}
                onKeyDown={e => e.key === 'Enter' && buscarManual()}
                placeholder="Nº da venda ou nome do cliente"
                className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-warning/50"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={buscarManual}
                disabled={buscandoManual || !buscaQuery.trim()}
                className="border-warning/30 text-warning hover:bg-warning/10"
              >
                {buscandoManual
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Search size={13} />
                }
              </Button>
            </div>

            {buscouManual && buscaResultados.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">Nenhuma venda encontrada.</p>
            )}

            {buscaResultados.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {buscaResultados.map(v => renderVenda(v, true))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
