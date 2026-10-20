'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, ChevronRight, Clock, User, Wrench } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { PainelLateral } from '@/components/painel-lateral'
import { ConcBadge } from '@/components/conciliacao-badge'
import { calcStatusMultiPagamento, pagamentosEfetivosOS, type StatusConc } from '@/lib/conciliacao-status'
import type { OSComDetalhes } from '@/lib/queries/ordens-servico'
import { cn } from '@/lib/utils'
import { rotuloStatusOS, tomStatusOS } from '../status-os'

const moeda = (v: string | null) =>
  v && parseFloat(v) > 0 ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
const dia = (d: Date | string) => format(new Date(d), 'dd/MM/yy', { locale: ptBR })

const motoDe = (os: OSComDetalhes) =>
  (os.chassi ? `${os.marca ?? ''} ${os.modelo ?? ''}` : `${os.marcaExterna ?? ''} ${os.modeloExterno ?? ''}`).trim() || '—'
const clienteDe = (os: OSComDetalhes) => os.clienteNome ?? os.clienteNomeExterno ?? null

/** Previsão só chama atenção enquanto a OS não fechou; em concluída/cancelada vira informação. */
const previsaoAtiva = (os: OSComDetalhes) => !['concluida', 'cancelada'].includes(os.status)

function Previsao({ os, className }: { os: OSComDetalhes; className?: string }) {
  if (!os.dataPrevisao) return null
  return (
    <span className={cn('inline-flex items-center gap-1', previsaoAtiva(os) ? 'text-warning' : 'text-muted-foreground', className)}>
      <Clock className="size-3.5" />{format(new Date(os.dataPrevisao), 'dd/MM HH:mm', { locale: ptBR })}
    </span>
  )
}

function concDe(os: OSComDetalhes): StatusConc {
  // Cancelada não tem conciliação a cobrar — o badge sumiria como 'pendente' pra sempre.
  if (os.valorTotal == null || os.status === 'cancelada') return 'na'
  return calcStatusMultiPagamento(
    pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal),
    os.conciliadoValor as number,
    os.pixConciliadoValor as number,
    os.valorTotal,
  )
}

export function StatusOS({ status }: { status: string }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tomStatusOS(status))}>{rotuloStatusOS(status)}</span>
}

/**
 * Ordens de serviço no padrão de Vendas (#248): celular/tablet em cartões, e o toque abre a gaveta
 * com o resumo; desktop com tabela enxuta e painel à direita. O trabalho na OS (status, itens,
 * pagamento) continua na página dela — "Abrir OS".
 */
export function OSLista({ lista }: { lista: OSComDetalhes[] }) {
  const [selId, setSelId] = useState<string | null>(null)
  const [gavetaId, setGavetaId] = useState<string | null>(null)
  const sel = lista.find(o => o.id === selId)
  const gaveta = lista.find(o => o.id === gavetaId)

  if (lista.length === 0) {
    return <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
  }

  return (
    <>
      {/* Celular/tablet */}
      <div className="grid gap-3 md:grid-cols-2 lg:hidden">
        {lista.map(os => { const conc = concDe(os); return (
          <button
            key={os.id}
            type="button"
            onClick={() => setGavetaId(os.id)}
            className="block w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-muted"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">OS #{os.numero ?? '—'}</span>
              <StatusOS status={os.status} />
            </span>
            <span className="mt-1 block truncate font-medium">{motoDe(os)}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {clienteDe(os) ?? 'Sem cliente'}{os.mecanicoNome ? ` · ${os.mecanicoNome}` : ''}
            </span>
            {os.dataPrevisao && <span className="mt-1 block text-xs">Previsão <Previsao os={os} /></span>}
            <span className="mt-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted-foreground">{os.lojaNome} · {dia(os.dataAbertura)}</span>
              <span className="flex items-center gap-2">
                {conc !== 'na' && <ConcBadge status={conc} />}
                <span className="font-semibold tabular-nums">{moeda(os.valorTotal)}</span>
              </span>
            </span>
          </button>
        ) })}
      </div>

      <Sheet open={!!gaveta} onOpenChange={o => !o && setGavetaId(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          {gaveta && (
            <>
              <SheetTitle className="text-lg">OS #{gaveta.numero ?? '—'}</SheetTitle>
              <ResumoOS os={gaveta} />
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
                <TableHead>Abertura · loja</TableHead>
                <TableHead>Moto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden 2xl:table-cell">Mecânico</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-8"><span className="sr-only">Abrir</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map(os => (
                <TableRow
                  key={os.id}
                  onClick={() => setSelId(os.id)}
                  className={cn('cursor-pointer hover:bg-muted', os.id === selId && 'bg-primary-soft hover:bg-primary-soft')}
                >
                  <TableCell className="font-mono text-muted-foreground">#{os.numero ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dia(os.dataAbertura)}
                    <span className="block max-w-28 truncate text-xs" title={os.lojaNome ?? ''}>{os.lojaNome}</span>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-48 truncate font-medium">{motoDe(os)}</span>
                    {os.chassi && <span className="block max-w-48 truncate font-mono text-[11px] text-muted-foreground">{os.chassi}</span>}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{clienteDe(os) ?? '—'}</TableCell>
                  <TableCell className="hidden max-w-32 truncate text-muted-foreground 2xl:table-cell">{os.mecanicoNome ?? '—'}</TableCell>
                  <TableCell><StatusOS status={os.status} /></TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{moeda(os.valorTotal)}</TableCell>
                  <TableCell>
                    <button type="button" aria-label={`Abrir resumo da OS #${os.numero}`} onClick={e => { e.stopPropagation(); setSelId(os.id) }} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {sel && (
          <PainelLateral key={sel.id} legenda={`OS #${sel.numero ?? '—'}`} onFechar={() => setSelId(null)}>
            <ResumoOS os={sel} />
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

function ResumoOS({ os }: { os: OSComDetalhes }) {
  const conc = concDe(os)
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">Aberta em {dia(os.dataAbertura)} · {os.lojaNome}</p>
        <p className="text-lg font-semibold">{motoDe(os)}</p>
        {os.chassi && <p className="font-mono text-xs text-muted-foreground">{os.chassi}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusOS status={os.status} />
          {conc !== 'na' && <ConcBadge status={conc} />}
        </div>
      </div>
      <div>
        <Linha rotulo="Cliente"><span className="inline-flex items-center gap-1"><User className="size-3.5 text-muted-foreground" />{clienteDe(os) ?? '—'}</span></Linha>
        <Linha rotulo="Mecânico"><span className="inline-flex items-center gap-1"><Wrench className="size-3.5 text-muted-foreground" />{os.mecanicoNome ?? '—'}</span></Linha>
        {os.dataPrevisao && (
          <Linha rotulo="Previsão"><Previsao os={os} /></Linha>
        )}
        {os.servicosResumo && <Linha rotulo="Serviços">{os.servicosResumo}</Linha>}
        <Linha rotulo="Valor"><span className="font-semibold tabular-nums">{moeda(os.valorTotal)}</span></Linha>
      </div>
      <Link href={`/ordens-servico/${os.id}`} className={cn(buttonVariants(), 'h-10 w-full gap-1.5')}>
        Abrir OS <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
