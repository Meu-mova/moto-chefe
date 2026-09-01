import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { calcStatusMultiPagamento } from '@/lib/conciliacao-status'
import { formatarCpfCnpj } from '@/lib/documento'
import { ConcBadge } from '@/components/conciliacao-badge'
import { Printer } from 'lucide-react'
import { ConciliacaoPecaDialog } from './conciliacao-peca-dialog'
import { ExcluirVendaPecaButton } from './excluir-venda-peca-button'
import { podeGerirPecas } from '../papeis'

type VendaPeca = {
  id: string
  numero: number
  lojaNome: string
  vendedorNome: string
  clienteNome: string | null
  clienteDocumento: string | null
  clienteTipoPessoa: string
  formaPagamento: string
  pagamentos: unknown
  valorTotal: string
  dataVenda: Date
  conciliadoValor: number
  pixConciliadoValor: number
  itens: string | null
}

const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  bonificacao: 'Bonificação', multiplo: 'Múltiplo',
}

function fmtBRL(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: Date) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function VendasPecasTable({ vendas, papel }: { vendas: VendaPeca[]; papel: string }) {
  // Apagar venda é o mesmo nível de quem define preço no catálogo — vendedor não mexe.
  const podeExcluir = podeGerirPecas(papel)
  // A última coluna existe sempre — o recibo é para todo mundo que vende; só a
  // lixeira dentro dela é que some para o vendedor.
  const colunas = 10

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
            <TableHead>Conciliação</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Data</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendas.map(v => {
            const statusConc = calcStatusMultiPagamento(v.pagamentos, v.conciliadoValor, v.pixConciliadoValor, v.valorTotal)
            const bonificada = parseFloat(v.valorTotal) < 0.01
            return (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-xs">#{v.numero}</TableCell>
                <TableCell className="text-sm text-slate-600 max-w-[240px] truncate" title={v.itens ?? ''}>{v.itens ?? '—'}</TableCell>
                <TableCell>{v.lojaNome}</TableCell>
                <TableCell>{v.vendedorNome}</TableCell>
                <TableCell>
                  {v.clienteNome ?? '—'}
                  {v.clienteDocumento && (
                    <p className="text-xs text-slate-400 font-mono">
                      {v.clienteTipoPessoa === 'juridica' ? 'CNPJ ' : 'CPF '}
                      {formatarCpfCnpj(v.clienteDocumento)}
                    </p>
                  )}
                </TableCell>
                <TableCell>{TIPO_LABEL[v.formaPagamento] ?? v.formaPagamento}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <ConcBadge status={statusConc} />
                    <ConciliacaoPecaDialog
                      vendaId={v.id}
                      numero={v.numero}
                      pagamentos={v.pagamentos}
                      papel={papel}
                      status={statusConc}
                    />
                  </div>
                </TableCell>
                <TableCell className={`text-right font-medium ${bonificada ? 'text-amber-600' : 'text-green-700'}`}>
                  {fmtBRL(v.valorTotal)}
                </TableCell>
                <TableCell className="text-right text-slate-500">{fmtData(v.dataVenda)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Link, não botão: a página do recibo já dispara window.print()
                        sozinha, e Server Component não aceita onClick. */}
                    <a
                      href={`/pecas/${v.id}/imprimir`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Imprimir recibo"
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Printer size={15} />
                    </a>
                    {podeExcluir && <ExcluirVendaPecaButton vendaId={v.id} numero={v.numero} />}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {vendas.length === 0 && (
            <TableRow>
              <TableCell colSpan={colunas} className="text-center text-slate-400 py-8">
                Nenhuma venda de peça neste recorte.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
