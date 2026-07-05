'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Venda = {
  id: string
  clienteNome: string
  clienteCpf: string
  valor: string
  formaPagamento: string
  dataVenda: Date
  lojaNome: string
  vendedorNome: string
  modelo: string
  marca: string
  cor: string
  chassi: string
  precoCompra: string | null
  valorLiquido: string
}

function formatCurrency(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function VendasTable({ vendas }: { vendas: Venda[] }) {
  if (vendas.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nenhuma venda no período.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Moto</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Pagamento</TableHead>
          <TableHead className="text-right">Custo</TableHead>
          <TableHead className="text-right">Lucro</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendas.map(v => {
          const custo = Number(v.precoCompra ?? 0)
          const lucro = Number(v.valorLiquido) - custo
          return (
            <TableRow key={v.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(v.dataVenda).toLocaleDateString('pt-BR')}
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">{v.marca} {v.modelo}</div>
                <div className="text-xs text-slate-400">{v.cor} — {v.chassi}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{v.clienteNome}</div>
                <div className="text-xs text-slate-400">{v.clienteCpf}</div>
              </TableCell>
              <TableCell>{v.vendedorNome}</TableCell>
              <TableCell>{v.lojaNome}</TableCell>
              <TableCell className="capitalize">{v.formaPagamento}</TableCell>
              <TableCell className="text-right font-mono text-sm text-slate-500">
                {v.precoCompra ? formatCurrency(v.precoCompra) : '—'}
              </TableCell>
              <TableCell className={`text-right font-mono text-sm font-medium ${lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(String(lucro))}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">{formatCurrency(v.valor)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
