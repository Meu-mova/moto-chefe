'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle } from 'lucide-react'

export type LinhaProduto = {
  marca: string
  modelo: string
  qtd: number
  totalLiquido: string
  totalCusto: string
  /** Quantas dessas motos não têm preço de compra registrado. */
  semCusto: number
}

const ORDENS = [
  { valor: 'lucro_medio', label: 'Lucro médio' },
  { valor: 'margem',      label: 'Margem %' },
  { valor: 'lucro_total', label: 'Lucro total' },
  { valor: 'volume',      label: 'Volume' },
] as const

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoProdutos({ linhas }: { linhas: LinhaProduto[] }) {
  // Lucro médio como padrão: a pergunta é "qual modelo vale mais a pena empurrar",
  // e o total premia quem já vende muito, escondendo o modelo de margem boa que
  // ainda vende pouco.
  const [ordem, setOrdem] = useState<string>('lucro_medio')

  const dados = linhas.map(l => {
    const liquido = Number(l.totalLiquido)
    const custo = Number(l.totalCusto)
    const lucro = liquido - custo
    return {
      ...l,
      liquido,
      custo,
      lucro,
      lucroMedio: l.qtd > 0 ? lucro / l.qtd : 0,
      precoMedio: l.qtd > 0 ? liquido / l.qtd : 0,
      margem: liquido > 0 ? (lucro / liquido) * 100 : 0,
    }
  })

  const ordenados = [...dados].sort((a, b) => {
    if (ordem === 'margem') return b.margem - a.margem
    if (ordem === 'lucro_total') return b.lucro - a.lucro
    if (ordem === 'volume') return b.qtd - a.qtd
    return b.lucroMedio - a.lucroMedio
  })

  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0)
  const totalLucro = dados.reduce((s, d) => s + d.lucro, 0)
  const totalLiquido = dados.reduce((s, d) => s + d.liquido, 0)
  const lucroMedioGeral = totalQtd > 0 ? totalLucro / totalQtd : 0
  const semCustoTotal = dados.reduce((s, d) => s + d.semCusto, 0)

  // A barra compara contra o maior lucro médio do período, não contra o total:
  // é a leitura de "qual modelo rende mais por unidade" que o card promete.
  const maiorLucroMedio = Math.max(1, ...dados.map(d => d.lucroMedio))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Lucro por Produto</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Faturamento líquido menos o custo da moto, por modelo. Não rateia despesa da operação.
            </p>
          </div>
          <div className="flex gap-1">
            {ORDENS.map(o => (
              <button
                key={o.valor}
                onClick={() => setOrdem(o.valor)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  ordem === o.valor
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-ring'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ordenados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma moto vendida no período.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="text-right">Lucro médio</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Lucro total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenados.map(d => (
                  <TableRow key={`${d.marca}-${d.modelo}`}>
                    <TableCell className="font-medium">
                      {d.marca} {d.modelo}
                      {/* Moto sem preço de compra entra com custo zero e infla o
                          lucro do modelo — dizer isso na linha evita decidir
                          estratégia em cima de um número que não existe. */}
                      {d.semCusto > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          <AlertTriangle size={9} /> {d.semCusto} sem custo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{d.qtd}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmt(d.precoMedio)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${d.lucroMedio >= 0 ? 'bg-success' : 'bg-destructive'}`}
                            style={{ width: `${Math.min(100, Math.abs(d.lucroMedio) / maiorLucroMedio * 100)}%` }}
                          />
                        </div>
                        <span className={`w-24 text-right font-mono font-semibold ${d.lucroMedio >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmt(d.lucroMedio)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right ${d.margem >= 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                      {d.margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmt(d.lucro)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Média do período</TableCell>
                  <TableCell className="text-right">{totalQtd}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(totalQtd > 0 ? totalLiquido / totalQtd : 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(lucroMedioGeral)}</TableCell>
                  <TableCell className="text-right">
                    {(totalLiquido > 0 ? (totalLucro / totalLiquido) * 100 : 0)
                      .toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(totalLucro)}</TableCell>
                </TableRow>
              </tfoot>
            </Table>

            {semCustoTotal > 0 && (
              <p className="mt-3 text-xs text-warning">
                <AlertTriangle size={12} className="inline -mt-0.5 mr-1" aria-hidden />{semCustoTotal} moto{semCustoTotal > 1 ? 's' : ''} sem preço de compra registrado
                cont{semCustoTotal > 1 ? 'am' : 'a'} como custo R$ 0,00: o lucro desses modelos está inflado.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
