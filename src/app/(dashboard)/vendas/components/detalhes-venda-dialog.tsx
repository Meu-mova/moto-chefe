'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, CheckCircle2, Clock } from 'lucide-react'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import { buscarConciliacoesDaVenda } from '../../conciliacao/actions'

const formatCurrency = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDate = (d: Date) =>
  new Date(d).toLocaleDateString('pt-BR')

const tipoLabel: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência Bancária',
}

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

type Conc = Awaited<ReturnType<typeof buscarConciliacoesDaVenda>>[number]
type Pgto = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }

function matchPagamentos(pgtos: Pgto[], concs: Conc[]): boolean[] {
  const usados = new Set<string>()
  const resultado = pgtos.map(() => false)

  // 1ª passagem: casa por código de autorização
  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || !p.autorizacao) return
    const match = concs.find(c => !usados.has(c.id) && c.autorizacao === p.autorizacao)
    if (match) { resultado[i] = true; usados.add(match.id) }
  })

  // 2ª passagem: casa por valor (tolerância R$0,05) para os que não têm autorização
  pgtos.forEach((p, i) => {
    if (!TIPOS_CARTAO.has(p.tipo) || resultado[i]) return
    const match = concs.find(c => !usados.has(c.id) && Math.abs(Number(c.valorBruto) - p.valor) <= 0.05)
    if (match) { resultado[i] = true; usados.add(match.id) }
  })

  return resultado
}

type Props = {
  venda: VendaComDetalhes
}

export function DetalhesVendaDialog({ venda: v }: Props) {
  const [open, setOpen]           = useState(false)
  const [concs, setConcs]         = useState<Conc[]>([])
  const [loadingConc, setLoading] = useState(false)

  const pagamentos = (v.pagamentos as Pgto[]) ?? []
  const temCartao  = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))

  async function abrirDialog() {
    setOpen(true)
    if (temCartao) {
      setLoading(true)
      try {
        setConcs(await buscarConciliacoesDaVenda(v.id))
      } finally {
        setLoading(false)
      }
    }
  }

  const conciliados = matchPagamentos(pagamentos, concs)

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
                <div className="space-y-1">
                  {pagamentos.map((p, i) => {
                    const precisaConc = TIPOS_CARTAO.has(p.tipo)
                    const conciliado  = precisaConc && conciliados[i]
                    const pendente    = precisaConc && !loadingConc && !conciliados[i]

                    return (
                      <div
                        key={i}
                        className={`flex justify-between items-center rounded px-3 py-2 ${
                          conciliado ? 'bg-green-50 border border-green-200' :
                          pendente   ? 'bg-red-50 border border-red-100' :
                                       'bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {precisaConc && (
                            loadingConc
                              ? <Clock size={13} className="text-slate-300 animate-pulse" />
                              : conciliado
                                ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                                : <Clock size={13} className="text-red-400 shrink-0" />
                          )}
                          <span className={conciliado ? 'text-green-800' : pendente ? 'text-red-700' : 'text-slate-600'}>
                            {tipoLabel[p.tipo] ?? p.tipo}
                            {p.operadora ? ` (${p.operadora})` : ''}
                            {p.parcelas  ? ` ${p.parcelas}x`  : ''}
                            {p.autorizacao ? <span className="ml-1 font-mono text-xs opacity-60">#{p.autorizacao}</span> : null}
                          </span>
                        </div>
                        <span className={`font-medium tabular-nums ${conciliado ? 'text-green-700' : ''}`}>
                          {formatCurrency(p.valor)}
                        </span>
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
        </DialogContent>
      </Dialog>
    </>
  )
}
