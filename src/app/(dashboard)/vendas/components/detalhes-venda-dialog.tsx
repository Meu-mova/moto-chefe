'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye } from 'lucide-react'
import type { VendaComDetalhes } from '@/lib/queries/vendas'

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

type Props = {
  venda: VendaComDetalhes
}

export function DetalhesVendaDialog({ venda: v }: Props) {
  const [open, setOpen] = useState(false)

  const pagamentos = (v.pagamentos as { tipo: string; valor: number; operadora?: string; parcelas?: number }[]) ?? []

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Ver detalhes"
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
      >
        <Eye size={16} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Venda</DialogTitle>
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
                  {pagamentos.map((p, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 rounded px-3 py-1.5">
                      <span className="text-slate-600">
                        {tipoLabel[p.tipo] ?? p.tipo}
                        {p.operadora ? ` (${p.operadora})` : ''}
                        {p.parcelas ? ` ${p.parcelas}x` : ''}
                      </span>
                      <span className="font-medium">{formatCurrency(p.valor)}</span>
                    </div>
                  ))}
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
