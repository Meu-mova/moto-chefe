'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type LinhaParcelamento = {
  /** 'cartao_credito' | 'link_pagamento' */
  tipo: string
  /** null nas vendas antigas, que não gravavam o número de parcelas. */
  parcelas: number | null
  qtdVendas: number
  total: string
}

const ABAS = [
  { valor: 'cartao_credito', label: 'Cartão de crédito' },
  { valor: 'link_pagamento', label: 'Link de pagamento' },
  { valor: 'ambos',          label: 'Somados' },
] as const

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoParcelamento({ linhas }: { linhas: LinhaParcelamento[] }) {
  // Começa no cartão da maquininha: é o "cartão de crédito" da conversa, e o
  // número aqui bate com a linha Cartão Crédito de Formas de Pagamento. Link tem
  // tabela de taxa própria (ver /precificacao), por isso não vem somado de saída.
  const [aba, setAba] = useState<string>('cartao_credito')

  const doRecorte = aba === 'ambos' ? linhas : linhas.filter(l => l.tipo === aba)

  // Soma os dois tipos quando a aba é "Somados": 12x no cartão e 12x no link são a
  // mesma escolha do cliente, só mudou por onde passou.
  const porParcela = new Map<number | null, { qtdVendas: number; total: number }>()
  for (const l of doRecorte) {
    const atual = porParcela.get(l.parcelas) ?? { qtdVendas: 0, total: 0 }
    atual.qtdVendas += l.qtdVendas
    atual.total += Number(l.total)
    porParcela.set(l.parcelas, atual)
  }

  // Ordem crescente de parcelas; "não informado" (null) por último, porque é
  // resíduo de venda antiga e não uma opção que alguém escolheu.
  const dados = [...porParcela.entries()]
    .map(([parcelas, v]) => ({ parcelas, ...v }))
    .sort((a, b) => {
      if (a.parcelas === null) return 1
      if (b.parcelas === null) return -1
      return a.parcelas - b.parcelas
    })

  const totalVendas = dados.reduce((s, d) => s + d.qtdVendas, 0)
  const totalValor = dados.reduce((s, d) => s + d.total, 0)
  const maiorQtd = Math.max(1, ...dados.map(d => d.qtdVendas))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Parcelamento no Cartão</CardTitle>
          <div className="flex gap-1">
            {ABAS.map(a => (
              <button
                key={a.valor}
                onClick={() => setAba(a.valor)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  aba === a.valor
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {dados.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma venda nesta forma no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcelas</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">% das vendas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.map(d => {
                const pct = totalVendas > 0 ? (d.qtdVendas / totalVendas) * 100 : 0
                return (
                  <TableRow key={String(d.parcelas)}>
                    <TableCell className="font-medium">
                      {d.parcelas === null
                        ? <span className="text-slate-400">não informado</span>
                        : `${d.parcelas}x`}
                    </TableCell>
                    <TableCell className="text-right">{d.qtdVendas}</TableCell>
                    <TableCell className="text-right">
                      {/* A barra é o que faz a comparação saltar aos olhos: a
                          tabela sozinha vira uma coluna de números parecidos. */}
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-700"
                            style={{ width: `${(d.qtdVendas / maiorQtd) * 100}%` }}
                          />
                        </div>
                        <span className="w-11 text-right text-sm text-slate-500">{pct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(d.total)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">
                      {fmt(d.qtdVendas > 0 ? d.total / d.qtdVendas : 0)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <tfoot>
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{totalVendas}</TableCell>
                <TableCell className="text-right">100%</TableCell>
                <TableCell className="text-right font-mono">{fmt(totalValor)}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(totalVendas > 0 ? totalValor / totalVendas : 0)}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        )}

        <p className="mt-3 text-xs text-slate-400">
          Conta a parcela lançada em cada pagamento da venda de moto. Uma venda com cartão e PIX aparece aqui só
          pela parte do cartão, e uma venda dividida em dois cartões de prazos diferentes conta nas duas linhas.
        </p>
      </CardContent>
    </Card>
  )
}
