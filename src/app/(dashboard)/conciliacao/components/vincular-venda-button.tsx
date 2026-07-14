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
  tipoVinculado?: 'moto' | 'peca'
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

  function vincular(alvoId: string, tipo: 'moto' | 'peca') {
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
            ? 'border-orange-200 hover:border-orange-400 hover:bg-orange-50'
            : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-800">
            {v.tipo === 'peca' && (
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 mr-1.5">PA</span>
            )}
            Venda #{v.numero} — {v.clienteNome}
          </span>
          <span className="font-semibold text-slate-900">
            {parseFloat(v.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {new Date(v.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          {' · '}{v.formaPagamento}
        </div>
        {pgtoCartao.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {pgtoCartao.map((p, i) => (
              <span
                key={i}
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  force ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
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
        <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
          <CheckCircle2 size={12} />
          {tipoVinculado === 'peca' && (
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 rounded px-1 py-0.5">PA</span>
          )}
          #{vendaVinculada.numero} — {vendaVinculada.clienteNome.split(' ')[0]}
        </span>
        <button
          onClick={desvincular}
          disabled={pending}
          title="Desvincular"
          className="text-slate-400 hover:text-red-500 transition-colors"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Link2Off size={12} />}
        </button>
      </div>
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-500" onClick={abrirModal}>
        <Link2 size={12} className="mr-1" /> Vincular
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular a uma venda</DialogTitle>
            <p className="text-sm text-slate-500">
              Recebimento de{' '}
              <span className="font-semibold">{valorRef.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              {' '}em {new Date(dataRef + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </DialogHeader>

          {/* ── Sugestões automáticas ── */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Sugestões por valor
            </p>

            {carregando && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            )}

            {!carregando && vendas.length === 0 && (
              <p className="text-sm text-slate-400 py-2">
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
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Forçar vínculo
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Pesquise pelo número da venda ou nome do cliente para vincular manualmente.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={buscaQuery}
                onChange={e => { setBuscaQuery(e.target.value); setBuscouManual(false) }}
                onKeyDown={e => e.key === 'Enter' && buscarManual()}
                placeholder="Nº da venda ou nome do cliente"
                className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={buscarManual}
                disabled={buscandoManual || !buscaQuery.trim()}
                className="border-orange-200 text-orange-700 hover:bg-orange-50"
              >
                {buscandoManual
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Search size={13} />
                }
              </Button>
            </div>

            {buscouManual && buscaResultados.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">Nenhuma venda encontrada.</p>
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
