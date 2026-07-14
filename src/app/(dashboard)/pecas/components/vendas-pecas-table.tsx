import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type VendaPeca = {
  id: string
  numero: number
  lojaNome: string
  vendedorNome: string
  clienteNome: string | null
  formaPagamento: string
  valorTotal: string
  dataVenda: Date
  itens: string | null
}

const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  multiplo: 'Múltiplo',
}

function fmtBRL(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: Date) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function VendasPecasTable({ vendas }: { vendas: VendaPeca[] }) {
  return (
    <div className="bg-white rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Itens</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendas.map(v => (
            <TableRow key={v.id}>
              <TableCell className="font-mono text-xs">#{v.numero}</TableCell>
              <TableCell className="text-sm text-slate-600 max-w-[240px] truncate" title={v.itens ?? ''}>{v.itens ?? '—'}</TableCell>
              <TableCell>{v.lojaNome}</TableCell>
              <TableCell>{v.vendedorNome}</TableCell>
              <TableCell>{v.clienteNome ?? '—'}</TableCell>
              <TableCell>{TIPO_LABEL[v.formaPagamento] ?? v.formaPagamento}</TableCell>
              <TableCell className="text-right font-medium text-green-700">{fmtBRL(v.valorTotal)}</TableCell>
              <TableCell className="text-right text-slate-500">{fmtData(v.dataVenda)}</TableCell>
            </TableRow>
          ))}
          {vendas.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                Nenhuma venda de peça registrada ainda.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
