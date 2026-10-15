'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Eye, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import type { DescontoDaVenda } from '@/lib/queries/descontos'
import { buscarHistoricoMotoAction } from '../actions'
import { DanfeButton } from '../../estoque/[id]/components/danfe-button'
import { TIPOS_CARTAO, type PgtoOS } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'
import { PainelAssinatura } from './painel-assinatura'
import { rotuloDocumento, tipoPessoaDoDocumento } from '@/lib/documento'
import { NfSaidaButton } from '../../estoque/components/nf-saida-button'
import { podeOperarNfSaida } from '../papeis-nf-saida'

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

type Tab = 'resumo' | 'pagamento' | 'assinatura' | 'historico'
const ABAS: [Tab, string][] = [['resumo', 'Resumo'], ['pagamento', 'Pagamento'], ['assinatura', 'Assinatura'], ['historico', 'Histórico']]

type Props = {
  venda: VendaComDetalhes
  papel: string
  desconto?: DescontoDaVenda
  /** Troca o botão padrão por outro (ex.: os botões do painel da venda). */
  gatilho?: (abrir: () => void) => React.ReactNode
}

function Par({ rotulo, children, mono }: { rotulo: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={cn('min-w-0 text-right break-words', mono && 'font-mono text-[13px]')}>{children}</span>
    </div>
  )
}

const link = 'text-primary-text underline-offset-2 hover:underline'

export function DetalhesVendaDialog({ venda: v, papel, desconto, gatilho }: Props) {
  const [open, setOpen]        = useState(false)
  const [tab, setTab]          = useState<Tab>('resumo')
  const [hist, setHist]        = useState<Hist[] | null>(null)
  const [histLoading, setHistLoading] = useState(false)

  const pagamentos = (v.pagamentos as Pgto[]) ?? []
  const temCartao  = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix     = pagamentos.some(p => p.tipo === 'pix')
  const podeEmitirNf = !v.notaFiscalSaida && podeOperarNfSaida(papel)

  // Só carrega lançamentos quando há algo a conciliar — venda em dinheiro não
  // precisa bater com nada. Ver src/components/pagamentos-conciliacao.tsx.
  const dados = useConciliacaoAlvo({ tipo: 'moto', id: v.id }, open && (temCartao || temPix))
  const { concs, loading } = dados

  const taxas = loading ? 0 : concs.reduce((s, c) => s + (Number(c.valorBruto) - Number(c.valorLiquido ?? c.valorBruto)), 0)
  const endereco = [
    [v.clienteLogradouro, v.clienteNumero, v.clienteComplemento, v.clienteBairro].filter(Boolean).join(', '),
    v.clienteCidade ? `${v.clienteCidade}/${v.clienteEstado}` : '',
    v.clienteCep ?? '',
  ].filter(Boolean).join(' — ')

  function abrirDialog() {
    setOpen(true)
    setTab('resumo')
  }

  async function irPara(t: Tab) {
    setTab(t)
    if (t !== 'historico' || hist !== null) return
    setHistLoading(true)
    try {
      setHist(await buscarHistoricoMotoAction(v.motoId))
    } finally {
      setHistLoading(false)
    }
  }

  return (
    <>
      {gatilho ? gatilho(abrirDialog) : (
      <Button
        variant="ghost"
        size="icon"
        title="Ver detalhes"
        onClick={abrirDialog}
        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
      >
        <Eye size={16} />
      </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Celular: tela cheia, como uma página. Do sm para cima: diálogo largo. */}
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
        >
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
            <button type="button" onClick={() => setOpen(false)} aria-label="Voltar" className="rounded-md p-2 hover:bg-muted sm:hidden">
              <ArrowLeft className="size-5" />
            </button>
            <DialogTitle className="flex-1 px-2 text-base font-semibold">Venda #{v.numero}</DialogTitle>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block">
              <X className="size-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 pt-4 pb-3">
              <p className="text-sm text-muted-foreground">{v.marca} {v.modelo} · {v.cor}</p>
              <p className="text-3xl font-bold tracking-tight tabular-nums">{formatCurrency(v.valor)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(v.dataVenda)} · {v.lojaNome}</p>
            </div>

            <nav className="sticky top-0 z-10 flex border-b border-border bg-popover px-2" role="tablist">
              {ABAS.map(([id, nome]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => irPara(id)}
                  className={cn('-mb-px flex-1 border-b-2 py-2.5 text-sm', tab === id ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {nome}
                </button>
              ))}
            </nav>

            <div className="px-4 py-2 text-sm">
              {tab === 'resumo' && (
                <div className="divide-y divide-border">
                  <Par rotulo="Cliente">{v.clienteNome}</Par>
                  <Par rotulo="Vendedor">{v.vendedorNome}</Par>
                  <Par rotulo="Chassi" mono>{v.chassi}</Par>
                  <Par rotulo="NF saída">
                    {v.notaFiscalSaida ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                        {v.notaFiscalSaida}
                        <DanfeButton motoId={v.motoId} />
                        <a href={`/vendas/${v.id}/checklist-entrega`} target="_blank" rel="noopener noreferrer" className={link}>Checklist de entrega</a>
                        <a href={`/vendas/${v.id}/certificado-bateria`} target="_blank" rel="noopener noreferrer" className={link}>Certificado da bateria</a>
                      </span>
                    ) : 'Ainda não emitida'}
                  </Par>
                  {taxas > 0 && (
                    <Par rotulo="Valor líquido">
                      <b className="tabular-nums">{formatCurrency(Number(v.valor) - taxas)}</b>
                      <span className="block text-xs text-muted-foreground">{formatCurrency(taxas)} em taxas</span>
                    </Par>
                  )}
                  {desconto && (
                    <div className="py-3">
                      <div className="border-l-2 border-destructive py-0.5 pl-3">
                        <p className="font-medium">Vendida abaixo do preço mínimo{desconto.estimado ? ' (valor estimado)' : ''}</p>
                        <p className="mt-1">
                          Margem <b className="tabular-nums text-destructive">{formatCurrency(desconto.margem)}</b>
                          <span className="text-muted-foreground"> · o que faltou pro piso depois das taxas</span>
                        </p>
                        <p>
                          Preço <b className="tabular-nums">{formatCurrency(desconto.preco)}</b>
                          <span className="text-muted-foreground"> · {desconto.preco > 0 ? 'cedido na negociação' : 'nada cedido, a diferença é taxa de cartão'}</span>
                        </p>
                        {desconto.motivo && <p className="mt-1 text-muted-foreground">Motivo: {desconto.motivo}</p>}
                        {desconto.estimado && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Reconstruído com a tabela de preços atual — esta aprovação é anterior a 21/08/2026 e não guardou o preço mínimo da época.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <section className="pt-4">
                    <h3 className="font-medium">Dados do cliente</h3>
                    <div className="divide-y divide-border">
                      <Par rotulo={rotuloDocumento(v.clienteCpf)} mono>{v.clienteCpf}</Par>
                      <Par rotulo="Celular">{v.clienteCelular ?? '—'}</Par>
                      <Par rotulo="E-mail">{v.clienteEmail ?? '—'}</Par>
                      {(v.representanteNome || v.representanteCpf) && (
                        <Par rotulo="Representante">
                          {[v.representanteNome, v.representanteCpf && `CPF ${v.representanteCpf}`].filter(Boolean).join(' — ')}
                        </Par>
                      )}
                      {tipoPessoaDoDocumento(v.clienteCpf) === 'juridica' && (
                        <Par rotulo="ICMS">
                          {v.clienteIndicadorIe === 'contribuinte'
                            ? `Contribuinte — IE ${v.clienteInscricaoEstadual || 'não informada'}`
                            : v.clienteIndicadorIe === 'isento' ? 'Isenta de inscrição estadual' : 'Não contribuinte'}
                        </Par>
                      )}
                      {endereco && <Par rotulo="Endereço">{endereco}</Par>}
                    </div>
                  </section>
                </div>
              )}

              {tab === 'pagamento' && (
                <div className="py-2">
                  {pagamentos.length > 0 ? (
                    <PagamentosConciliacao alvo={{ tipo: 'moto', id: v.id }} pagamentos={pagamentos} dados={dados} papel={papel} />
                  ) : (
                    <p className="text-muted-foreground">{tipoLabel[v.formaPagamento] ?? v.formaPagamento} — {formatCurrency(v.valor)}</p>
                  )}
                </div>
              )}

              {/* Montado só na aba: carrega os documentos quando a pessoa abre a aba. */}
              {tab === 'assinatura' && (
                <div className="py-2">
                  <PainelAssinatura vendaId={v.id} aberto={open} papel={papel} />
                </div>
              )}

              {tab === 'historico' && (
                <div className="py-2">
                  {histLoading && <p className="py-6 text-center text-muted-foreground">Carregando histórico…</p>}
                  {!histLoading && hist !== null && hist.length === 0 && (
                    <p className="py-6 text-center text-muted-foreground">Nenhum evento registrado.</p>
                  )}
                  {!histLoading && hist !== null && hist.length > 0 && (
                    <ol className="divide-y divide-border">
                      {hist.map(h => (
                        <li key={h.id} className="flex gap-3 py-3">
                          <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{h.data ? formatDateTime(h.data) : '—'}</span>
                          <div className="min-w-0">
                            <p className="font-medium">{historicoTipoLabel[h.tipo] ?? h.tipo}</p>
                            {h.statusAnterior && h.statusNovo && (
                              <p className="text-xs text-muted-foreground">
                                {statusLabel[h.statusAnterior] ?? h.statusAnterior} → {statusLabel[h.statusNovo] ?? h.statusNovo}
                              </p>
                            )}
                            {h.observacao && <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{h.observacao}</p>}
                            <p className="text-xs text-muted-foreground">por {h.usuarioNome ?? 'Usuário removido'}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </div>

          {podeEmitirNf && (
            <footer className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <NfSaidaButton
                motoId={v.motoId}
                descricao={`${v.modelo} — ${v.chassi}`}
                gatilho={abrir => (
                  <button type="button" onClick={abrir} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
                    <FileText className="size-4" /> Emitir NF de saída
                  </button>
                )}
              />
            </footer>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
