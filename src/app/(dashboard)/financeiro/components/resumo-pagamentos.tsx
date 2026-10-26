'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ResumoPagamento = {
  tipo: string
  total: string
  qtdVendas: number
}

const LABELS: Record<string, string> = {
  cartao_credito: 'Cartão Crédito',
  cartao_debito: 'Cartão Débito',
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  financiamento: 'Financiamento',
  link: 'Link de Pagamento',
}

function fmt(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ResumoPagamentos({ resumo }: { resumo: ResumoPagamento[] }) {
  const totalGeral = resumo.reduce((s, r) => s + Number(r.total), 0)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Formas de Pagamento</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Forma</TableHead>
              <TableHead className="text-right">Qtd Vendas</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumo.map(r => {
              const pct = totalGeral > 0 ? (Number(r.total) / totalGeral) * 100 : 0
              return (
                <TableRow key={r.tipo}>
                  <TableCell className="font-medium">{LABELS[r.tipo] ?? r.tipo}</TableCell>
                  <TableCell className="text-right">{r.qtdVendas}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.total)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{pct.toFixed(1)}%</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {resumo.length > 1 && (
            <tfoot>
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{resumo.reduce((s, r) => s + r.qtdVendas, 0)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totalGeral)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
              </TableRow>
            </tfoot>
          )}
        </Table>
      </CardContent>
    </Card>
  )
}
