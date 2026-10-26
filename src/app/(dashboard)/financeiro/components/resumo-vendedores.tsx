'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ResumoVendedor = {
  vendedorNome: string
  qtdVendas: number
  totalBruto: string
  totalLiquido: string
}

function fmt(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoVendedores({ resumo }: { resumo: ResumoVendedor[] }) {
  const totalBruto = resumo.reduce((s, r) => s + Number(r.totalBruto), 0)
  const totalLiquido = resumo.reduce((s, r) => s + Number(r.totalLiquido), 0)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vendas por Vendedor — Bruto vs Líquido</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">Taxas</TableHead>
              <TableHead className="text-right">% Taxa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumo.map(r => {
              const bruto = Number(r.totalBruto)
              const liquido = Number(r.totalLiquido)
              const taxas = bruto - liquido
              const pct = bruto > 0 ? (taxas / bruto) * 100 : 0
              return (
                <TableRow key={r.vendedorNome}>
                  <TableCell className="font-medium">{r.vendedorNome}</TableCell>
                  <TableCell className="text-right">{r.qtdVendas}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(bruto)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(liquido)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">
                    {taxas > 0 ? `-${fmt(taxas)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {resumo.length > 1 && (
            <tfoot>
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{resumo.reduce((s, r) => s + r.qtdVendas, 0)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totalBruto)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totalLiquido)}</TableCell>
                <TableCell className="text-right font-mono text-destructive">-{fmt(totalBruto - totalLiquido)}</TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {totalBruto > 0 ? `${(((totalBruto - totalLiquido) / totalBruto) * 100).toFixed(1)}%` : '—'}
                </TableCell>
              </TableRow>
            </tfoot>
          )}
        </Table>
      </CardContent>
    </Card>
  )
}
