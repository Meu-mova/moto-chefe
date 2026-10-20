'use client'
import { useState } from 'react'
import { ChevronRight, Printer } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { PainelLateral } from '@/components/painel-lateral'
import { calcStatusMultiPagamento, type StatusConc } from '@/lib/conciliacao-status'
import { formatarCpfCnpj } from '@/lib/documento'
import { ConcBadge } from '@/components/conciliacao-badge'
import { cn } from '@/lib/utils'
import { ConciliacaoPecaDialog } from './conciliacao-peca-dialog'
import { ExcluirVendaPecaButton } from './excluir-venda-peca-button'
import { VendaPecaDialog } from './venda-peca-dialog'
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

type PecaCatalogo = { id: string; nome: string; valor: string; quantidadeEstoque: number }

const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  bonificacao: 'Bonificação', multiplo: 'Múltiplo',
}

const moeda = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const dataHora = (d: Date) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const bonificada = (v: VendaPeca) => parseFloat(v.valorTotal) < 0.01

type Props = { vendas: VendaPeca[]; papel: string; pecas: PecaCatalogo[] }

/**
 * Vendas de peças no padrão de Vendas (#247): celular/tablet em cartões, e o toque abre a gaveta com o
 * detalhe; no desktop, tabela enxuta e o painel à direita. Recibo, editar e excluir ficam no detalhe.
 */
export function VendasPecasTable({ vendas, papel, pecas }: Props) {
  // Só o id: depois de editar, o revalidatePath traz a venda nova e o detalhe mostra ela.
  const [selId, setSelId] = useState<string | null>(null)
  const [gavetaId, setGavetaId] = useState<string | null>(null)
  const itens = vendas.map(v => ({ v, status: calcStatusMultiPagamento(v.pagamentos, v.conciliadoValor, v.pixConciliadoValor, v.valorTotal) }))
  const sel = itens.find(i => i.v.id === selId)
  const gaveta = itens.find(i => i.v.id === gavetaId)

  return (
    <>
      {/* Celular/tablet */}
      <div className="space-y-3 lg:hidden">
        {itens.length === 0 && (
          <p className="rounded-lg border border-border bg-card py-8 text-center text-sm text-muted-foreground">Nenhuma venda de peça neste recorte.</p>
        )}
        {itens.map(({ v, status }) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setGavetaId(v.id)}
            className="block w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-muted"
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>#{v.numero} · {data(v.dataVenda)}</span>
              <ConcBadge status={status} />
            </span>
            <span className="mt-1 block truncate font-semibold">{v.itens ?? '—'}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {v.clienteNome ?? 'Sem cliente'} · {v.vendedorNome} · {TIPO_LABEL[v.formaPagamento] ?? v.formaPagamento}
            </span>
            <span className={cn('mt-1 block text-lg font-bold tabular-nums', bonificada(v) && 'text-warning')}>{moeda(v.valorTotal)}</span>
          </button>
        ))}
      </div>

      <Sheet open={!!gaveta} onOpenChange={o => !o && setGavetaId(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          {gaveta && (
            <>
              <SheetTitle className="text-lg">Venda de peças #{gaveta.v.numero}</SheetTitle>
              <DetalheVendaPeca v={gaveta.v} status={gaveta.status} papel={papel} pecas={pecas} />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Desktop: tabela enxuta; clicar na linha abre o painel à direita. */}
      <div className="hidden items-start gap-4 lg:flex">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden 2xl:table-cell">Vendedor</TableHead>
                <TableHead>Conciliação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-8"><span className="sr-only">Abrir</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map(({ v, status }) => (
                <TableRow
                  key={v.id}
                  onClick={() => setSelId(v.id)}
                  className={cn('cursor-pointer hover:bg-muted', v.id === selId && 'bg-primary-soft hover:bg-primary-soft')}
                >
                  <TableCell className="font-mono text-muted-foreground">#{v.numero}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{data(v.dataVenda)}</TableCell>
                  <TableCell className="max-w-44 truncate 2xl:max-w-72" title={v.itens ?? ''}>{v.itens ?? '—'}</TableCell>
                  <TableCell className="max-w-32 truncate 2xl:max-w-48">{v.clienteNome ?? '—'}</TableCell>
                  <TableCell className="hidden max-w-32 truncate text-muted-foreground 2xl:table-cell">{v.vendedorNome}</TableCell>
                  <TableCell><ConcBadge status={status} /></TableCell>
                  <TableCell className={cn('text-right font-semibold whitespace-nowrap tabular-nums', bonificada(v) && 'text-warning')}>{moeda(v.valorTotal)}</TableCell>
                  <TableCell>
                    <button type="button" aria-label={`Abrir venda #${v.numero}`} onClick={e => { e.stopPropagation(); setSelId(v.id) }} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma venda de peça neste recorte.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {sel && (
          <PainelLateral key={sel.v.id} legenda={`Venda de peças #${sel.v.numero}`} onFechar={() => setSelId(null)}>
            <DetalheVendaPeca v={sel.v} status={sel.status} papel={papel} pecas={pecas} />
          </PainelLateral>
        )}
      </div>
    </>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}

function DetalheVendaPeca({ v, status, papel, pecas }: { v: VendaPeca; status: StatusConc; papel: string; pecas: PecaCatalogo[] }) {
  // Apagar venda é o mesmo nível de quem define preço no catálogo — vendedor não mexe.
  const gestor = podeGerirPecas(papel)
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">{dataHora(v.dataVenda)} · {v.lojaNome}</p>
        <p className={cn('text-2xl font-bold tabular-nums', bonificada(v) && 'text-warning')}>{moeda(v.valorTotal)}</p>
      </div>
      <div>
        <Linha rotulo="Itens">{v.itens ?? '—'}</Linha>
        <Linha rotulo="Cliente">
          {v.clienteNome ?? '—'}
          {v.clienteDocumento && (
            <span className="block font-mono text-xs text-muted-foreground">
              {v.clienteTipoPessoa === 'juridica' ? 'CNPJ ' : 'CPF '}{formatarCpfCnpj(v.clienteDocumento)}
            </span>
          )}
        </Linha>
        <Linha rotulo="Vendedor">{v.vendedorNome}</Linha>
        <Linha rotulo="Pagamento">{TIPO_LABEL[v.formaPagamento] ?? v.formaPagamento}</Linha>
        <Linha rotulo="Conciliação">
          <span className="inline-flex items-center gap-1">
            <ConcBadge status={status} />
            <ConciliacaoPecaDialog vendaId={v.id} numero={v.numero} pagamentos={v.pagamentos} papel={papel} status={status} />
          </span>
        </Linha>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Link, não botão: a página do recibo já dispara window.print() sozinha. */}
        <a
          href={`/pecas/${v.id}/imprimir`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 flex-1 gap-1.5')}
        >
          <Printer className="size-4" /> Recibo
        </a>
        <VendaPecaDialog
          pecas={pecas}
          lojas={[]}
          lojaUsuarioId={null}
          isAdmin={false}
          podeDefinirPreco={gestor}
          edicao={{ vendaId: v.id, numero: v.numero }}
        />
        {gestor && <ExcluirVendaPecaButton vendaId={v.id} numero={v.numero} />}
      </div>
    </div>
  )
}
