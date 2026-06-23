'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, CheckCircle2, Clock, History, FileText, Search, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import {
  buscarConciliacoesDaVenda,
  buscarPixDaVenda,
  buscarConciliacoesPorValor,
  vincularVendaAction,
} from '../../conciliacao/actions'
import { buscarHistoricoMotoAction } from '../actions'

const formatCurrency = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('pt-BR')

const formatDateTime = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

const tipoLabel: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência Bancária',
}

const statusLabel: Record<string, string> = {
  caixa: 'Caixa', montada: 'Montada', em_garantia: 'Garantia',
  faturada: 'Caixa', disponivel: 'Disponível', reservada: 'Reservada', vendida: 'Vendida',
}

const historicoTipoLabel: Record<string, string> = {
  entrada: 'Entrada no estoque',
  saida: 'Saída (Venda)',
  transferencia_enviada: 'Transferência enviada',
  transferencia_recebida: 'Transferência recebida',
  mudanca_status: 'Mudança de status',
}

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

type Conc        = Awaited<ReturnType<typeof buscarConciliacoesDaVenda>>[number]
type PixRec      = Awaited<ReturnType<typeof buscarPixDaVenda>>[number]
type Hist        = Awaited<ReturnType<typeof buscarHistoricoMotoAction>>[number]
type Candidato   = Awaited<ReturnType<typeof buscarConciliacoesPorValor>>[number]
type Pgto        = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }

function matchPagamentos(pgtos: Pgto[], concs: Conc[], pixRecs: PixRec[]): boolean[] {
  const usados   = new Set<string>()
  const resultado = pgtos.map(() => false)

  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || !p.autorizacao) return
    const m = concs.find(c => !usados.has(c.id) && c.autorizacao === p.autorizacao)
    if (m) { resultado[i] = true; usados.add(m.id) }
  })

  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || resultado[i]) return
    const m = concs.find(c => !usados.has(c.id) && Math.abs(Number(c.valorBruto) - p.valor) <= 0.05)
    if (m) { resultado[i] = true; usados.add(m.id) }
  })

  if (pixRecs.length > 0) {
    pgtos.forEach((p, i) => { if (p.tipo === 'pix') resultado[i] = true })
  }

  return resultado
}

type Tab = 'detalhes' | 'historico'
type Props = { venda: VendaComDetalhes; isAdmin?: boolean }

export function DetalhesVendaDialog({ venda: v, isAdmin = false }: Props) {
  const [open, setOpen]        = useState(false)
  const [tab, setTab]          = useState<Tab>('detalhes')
  const [concs, setConcs]      = useState<Conc[]>([])
  const [pixRecs, setPixRecs]  = useState<PixRec[]>([])
  const [hist, setHist]        = useState<Hist[] | null>(null)
  const [loading, setLoading]  = useState(false)
  const [histLoading, setHistLoading] = useState(false)

  // ── Busca de candidatos de conciliação ────────────────────────────────────
  const [buscandoIdx, setBuscandoIdx]   = useState<number | null>(null)
  const [candidatos, setCandidatos]     = useState<Candidato[]>([])
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [vinculando, setVinculando]     = useState(false)

  const pagamentos = (v.pagamentos as Pgto[]) ?? []
  const temCartao  = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix     = pagamentos.some(p => p.tipo === 'pix')

  async function abrirDialog() {
    setOpen(true)
    setTab('detalhes')
    setBuscandoIdx(null)
    if (temCartao || temPix) {
      setLoading(true)
      try {
        const [c, px] = await Promise.all([
          temCartao ? buscarConciliacoesDaVenda(v.id) : Promise.resolve([]),
          temPix    ? buscarPixDaVenda(v.id)          : Promise.resolve([]),
        ])
        setConcs(c)
        setPixRecs(px)
      } finally {
        setLoading(false)
      }
    }
  }

  async function carregarHistorico() {
    setTab('historico')
    if (hist !== null) return
    setHistLoading(true)
    try {
      setHist(await buscarHistoricoMotoAction(v.motoId))
    } finally {
      setHistLoading(false)
    }
  }

  async function buscarCandidatos(idx: number, valor: number) {
    if (buscandoIdx === idx) { setBuscandoIdx(null); return }
    setBuscandoIdx(idx)
    setBuscaLoading(true)
    setCandidatos([])
    try {
      setCandidatos(await buscarConciliacoesPorValor(valor))
    } catch {
      toast.error('Erro ao buscar transações')
      setBuscandoIdx(null)
    } finally {
      setBuscaLoading(false)
    }
  }

  async function vincular(conciliacaoId: string) {
    setVinculando(true)
    try {
      await vincularVendaAction(conciliacaoId, v.id)
      const updated = await buscarConciliacoesDaVenda(v.id)
      setConcs(updated)
      setBuscandoIdx(null)
      setCandidatos([])
      toast.success('Pagamento conciliado')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  const conciliados = matchPagamentos(pagamentos, concs, pixRecs)

  const operadoraLabel: Record<string, string> = {
    infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
    cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Ver detalhes"
        onClick={abrirDialog}
        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
      >
        <Eye size={16} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Venda #{v.numero}</DialogTitle>
            <p className="text-sm text-slate-500">{v.marca} {v.modelo} — {v.cor}</p>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-100">
            <button
              onClick={() => setTab('detalhes')}
              className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
                tab === 'detalhes'
                  ? 'text-blue-700 border-b-2 border-blue-600 -mb-px'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Detalhes
            </button>
            <button
              onClick={carregarHistorico}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
                tab === 'historico'
                  ? 'text-blue-700 border-b-2 border-blue-600 -mb-px'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History size={13} />
              Histórico
            </button>
          </div>

          {/* ─── Aba Detalhes ─────────────────────────────────────────── */}
          {tab === 'detalhes' && (
            <div className="space-y-5 text-sm">
              {/* Moto */}
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-700">Moto</p>
                <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                  <p>Modelo: <span className="text-slate-900 font-medium">{v.marca} {v.modelo}</span></p>
                  <p>Cor: <span className="text-slate-900">{v.cor}</span></p>
                  <p className="col-span-2">Chassi: <span className="text-slate-900 font-mono text-xs">{v.chassi}</span></p>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Venda */}
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-700">Venda</p>
                <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                  <p className="col-span-2">Número: <span className="text-slate-900 font-mono font-semibold">#{v.numero}</span></p>
                  <p>Data: <span className="text-slate-900">{formatDate(v.dataVenda)}</span></p>
                  <p>Loja: <span className="text-slate-900">{v.lojaNome}</span></p>
                  <p>Vendedor: <span className="text-slate-900">{v.vendedorNome}</span></p>
                  <p>NF Saída: <span className="text-slate-900">{v.notaFiscalSaida ?? '—'}</span></p>
                  <p className="col-span-2">Valor: <span className="text-green-700 font-bold text-base">{formatCurrency(v.valor)}</span></p>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Pagamento */}
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-700">Pagamento</p>
                {pagamentos.length > 0 ? (
                  <div className="space-y-1.5">
                    {pagamentos.map((p, i) => {
                      const precisaConc = TIPOS_CARTAO.has(p.tipo) || p.tipo === 'pix'
                      const conciliado  = precisaConc && conciliados[i]
                      const pendente    = precisaConc && !loading && !conciliados[i]
                      const aberto      = buscandoIdx === i

                      return (
                        <div key={i} className="space-y-1">
                          {/* Linha do pagamento */}
                          <div
                            className={`flex justify-between items-center rounded px-3 py-2 ${
                              conciliado ? 'bg-green-50 border border-green-200' :
                              pendente   ? 'bg-red-50 border border-red-200' :
                                           'bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {precisaConc && (
                                loading
                                  ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
                                  : conciliado
                                    ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                                    : <Clock size={13} className="text-red-400 shrink-0" />
                              )}
                              <span className={`truncate ${conciliado ? 'text-green-800' : pendente ? 'text-red-700' : 'text-slate-600'}`}>
                                {tipoLabel[p.tipo] ?? p.tipo}
                                {p.operadora ? ` (${p.operadora})` : ''}
                                {p.parcelas  ? ` ${p.parcelas}x`  : ''}
                                {p.autorizacao
                                  ? <span className="ml-1 font-mono text-xs opacity-60">#{p.autorizacao}</span>
                                  : null}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span className={`font-medium tabular-nums ${conciliado ? 'text-green-700' : ''}`}>
                                {formatCurrency(p.valor)}
                              </span>
                              {/* Botão de busca — só para admins em pagamentos pendentes de cartão */}
                              {isAdmin && pendente && TIPOS_CARTAO.has(p.tipo) && (
                                <button
                                  onClick={() => buscarCandidatos(i, p.valor)}
                                  title="Buscar transação para conciliar"
                                  className={`p-1 rounded transition-colors ${
                                    aberto
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                  }`}
                                >
                                  <Search size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Painel de candidatos */}
                          {aberto && (
                            <div className="ml-4 border border-blue-100 rounded-lg bg-blue-50 p-2 space-y-1">
                              <p className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
                                <Search size={11} />
                                Transações com valor próximo não vinculadas
                              </p>

                              {buscaLoading && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 py-1">
                                  <Loader2 size={12} className="animate-spin" />
                                  Buscando…
                                </div>
                              )}

                              {!buscaLoading && candidatos.length === 0 && (
                                <p className="text-xs text-slate-500 py-1">
                                  Nenhuma transação encontrada com este valor. Importe o relatório da operadora no módulo de conciliação.
                                </p>
                              )}

                              {!buscaLoading && candidatos.map(c => {
                                const raw = c.rawData as { bandeira?: string; portador?: string } | null
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => vincular(c.id)}
                                    disabled={vinculando}
                                    className="w-full text-left rounded px-2.5 py-2 bg-white border border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors text-xs disabled:opacity-50"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="font-medium text-slate-800">
                                          {operadoraLabel[c.operadora] ?? c.operadora}
                                          {raw?.bandeira ? ` · ${raw.bandeira}` : ''}
                                          {c.tipo === 'debito' ? ' (Débito)' : ''}
                                        </span>
                                        {c.autorizacao && (
                                          <span className="ml-1.5 font-mono text-slate-500">#{c.autorizacao}</span>
                                        )}
                                        {raw?.portador && (
                                          <span className="ml-1.5 text-slate-400">{raw.portador}</span>
                                        )}
                                        <p className="text-slate-400 mt-0.5">
                                          {c.dataTransacao ? new Date(c.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 text-blue-600 shrink-0">
                                        {vinculando
                                          ? <Loader2 size={11} className="animate-spin" />
                                          : <Link2 size={11} />}
                                        <span className="font-semibold">{formatCurrency(c.valorBruto)}</span>
                                      </div>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-slate-500">{tipoLabel[v.formaPagamento] ?? v.formaPagamento} — {formatCurrency(v.valor)}</p>
                )}
              </div>

              <div className="h-px bg-slate-100" />

              {/* Cliente */}
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-700">Cliente</p>
                <div className="grid grid-cols-2 gap-1.5 text-slate-600">
                  <p className="col-span-2">Nome: <span className="text-slate-900 font-medium">{v.clienteNome}</span></p>
                  <p>CPF: <span className="text-slate-900 font-mono">{v.clienteCpf}</span></p>
                  <p>Celular: <span className="text-slate-900">{v.clienteCelular ?? '—'}</span></p>
                  <p className="col-span-2">E-mail: <span className="text-slate-900">{v.clienteEmail ?? '—'}</span></p>
                  {(v.clienteLogradouro || v.clienteCidade) && (
                    <p className="col-span-2">
                      Endereço: <span className="text-slate-900">
                        {[v.clienteLogradouro, v.clienteNumero, v.clienteComplemento, v.clienteBairro].filter(Boolean).join(', ')}
                        {v.clienteCidade ? ` — ${v.clienteCidade}/${v.clienteEstado}` : ''}
                        {v.clienteCep ? ` (${v.clienteCep})` : ''}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Aba Histórico ────────────────────────────────────────── */}
          {tab === 'historico' && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between p-3 border rounded-lg bg-slate-50">
                <div className="flex items-start gap-2">
                  <FileText size={15} className="text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium text-slate-700">Nota Fiscal de Entrada</p>
                </div>
              </div>

              {histLoading && (
                <p className="text-center text-slate-400 py-6 animate-pulse">Carregando histórico…</p>
              )}

              {!histLoading && hist !== null && hist.map(h => (
                <div key={h.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{historicoTipoLabel[h.tipo] ?? h.tipo}</p>
                    {h.statusAnterior && h.statusNovo && (
                      <p className="text-xs text-slate-500">
                        {statusLabel[h.statusAnterior] ?? h.statusAnterior}
                        {' → '}
                        {statusLabel[h.statusNovo] ?? h.statusNovo}
                      </p>
                    )}
                    {h.observacao && (
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{h.observacao}</p>
                    )}
                    <p className="text-xs text-slate-400">por {h.usuarioNome ?? 'Usuário removido'}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap ml-4">
                    {h.data ? formatDateTime(h.data) : '—'}
                  </span>
                </div>
              ))}

              {!histLoading && hist !== null && hist.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum evento registrado.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
