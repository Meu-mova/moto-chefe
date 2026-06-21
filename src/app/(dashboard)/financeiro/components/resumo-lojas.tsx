'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ResumoLoja = {
  lojaId: string
  lojaNome: string
  totalVendas: string
  qtdVendas: number
}

function formatCurrency(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoLojas({ resumo }: { resumo: ResumoLoja[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vendas por Loja</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Qtd Vendas</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumo.map(r => (
              <TableRow key={r.lojaId}>
                <TableCell className="font-medium">{r.lojaNome}</TableCell>
                <TableCell className="text-right">{r.qtdVendas}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.totalVendas)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
