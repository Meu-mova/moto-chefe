'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, History, FileText } from 'lucide-react'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import type { DescontoDaVenda } from '@/lib/queries/descontos'
import { buscarHistoricoMotoAction } from '../actions'
import { DanfeButton } from '../../estoque/[id]/components/danfe-button'
import { TIPOS_CARTAO, type PgtoOS } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'
import { PainelAssinatura } from './painel-assinatura'

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

type Hist        = Awaited<ReturnType<typeof buscarHistoricoMotoAction>>[number]
type Pgto        = PgtoOS

type Tab = 'detalhes' | 'historico'
type Props = { venda: VendaComDetalhes; papel: string; desconto?: DescontoDaVenda }

export function DetalhesVendaDialog({ venda: v, papel, desconto }: Props) {
  const [open, setOpen]        = useState(false)
  const [tab, setTab]          = useState<Tab>('detalhes')
  const [hist, setHist]        = useState<Hist[] | null>(null)
  const [histLoading, setHistLoading] = useState(false)

  const pagamentos = (v.pagamentos as Pgto[]) ?? []
  const temCartao  = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix     = pagamentos.some(p => p.tipo === 'pix')

  // Só carrega lançamentos quando há algo a conciliar — venda em dinheiro não
  // precisa bater com nada. Ver src/components/pagamentos-conciliacao.tsx.
  const dados = useConciliacaoAlvo({ tipo: 'moto', id: v.id }, open && (temCartao || temPix))
  const { concs, loading } = dados

  function abrirDialog() {
    setOpen(true)
    setTab('detalhes')
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
              {/* Assinatura digital — contrato trava a NF, então vem no topo */}
              <PainelAssinatura vendaId={v.id} aberto={open} papel={papel} />

              <div className="h-px bg-slate-100" />

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
                  <p className="flex items-center gap-2 flex-wrap">
                    NF Saída: <span className="text-slate-900">{v.notaFiscalSaida ?? '—'}</span>
                    {v.notaFiscalSaida && v.blingNfeId && (
                      <DanfeButton motoId={v.motoId} />
                    )}
                    {v.notaFiscalSaida && (
                      <>
                        <a
                          href={`/vendas/${v.id}/checklist-entrega`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Checklist de Entrega
                        </a>
                        <a
                          href={`/vendas/${v.id}/certificado-bateria`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Certificado Bateria
                        </a>
                      </>
                    )}
                  </p>
                  <p className="col-span-2">Valor Bruto: <span className="text-green-700 font-bold text-base">{formatCurrency(v.valor)}</span></p>
                  {(() => {
                    if (loading || concs.length === 0) return null
                    const taxas = concs.reduce((s, c) =>
                      s + (Number(c.valorBruto) - Number(c.valorLiquido ?? c.valorBruto)), 0)
                    if (taxas <= 0) return null
                    const liquido = Number(v.valor) - taxas
                    return (
                      <>
                        <p className="col-span-2">
                          Valor Líquido:{' '}
                          <span className="text-blue-700 font-bold text-base">{formatCurrency(liquido)}</span>
                          <span className="ml-2 text-xs text-red-500">({formatCurrency(taxas)} em taxas)</span>
                        </p>
                      </>
                    )
                  })()}
                  {desconto && (
                    <div className="col-span-2 mt-1 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 space-y-0.5">
                      <p className="font-semibold text-rose-700">
                        Vendida abaixo do preço mínimo{desconto.estimado ? ' (valor estimado)' : ''}
                      </p>
                      <p className="text-rose-700">
                        Margem: <span className="font-bold">{formatCurrency(desconto.margem)}</span>
                        <span className="ml-1 text-xs text-rose-500">o que faltou pro piso depois das taxas</span>
                      </p>
                      <p className="text-rose-700">
                        Preço: <span className="font-bold">{formatCurrency(desconto.preco)}</span>
                        <span className="ml-1 text-xs text-rose-500">
                          {desconto.preco > 0 ? 'cedido na negociação' : 'nada cedido — a diferença é taxa de cartão'}
                        </span>
                      </p>
                      {desconto.motivo && (
                        <p className="text-xs text-slate-500 pt-0.5">Motivo informado: {desconto.motivo}</p>
                      )}
                      {desconto.estimado && (
                        <p className="text-[11px] text-slate-400">
                          Reconstruído com a tabela de preços atual — esta aprovação é anterior a 21/08/2026 e não guardou o preço mínimo da época.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Pagamento */}
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-700">Pagamento</p>
                {pagamentos.length > 0 ? (
                  <PagamentosConciliacao
                    alvo={{ tipo: 'moto', id: v.id }}
                    pagamentos={pagamentos}
                    dados={dados}
                    papel={papel}
                  />
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
