'use client'
import { useState } from 'react'
import { Building2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CorrespondenciaForm, rotuloCorrespondencia, type Correspondencia } from './correspondencia-form'

export type LinhaPix = {
  id: string
  data: string
  tipo: string
  pagador: string | null
  descricao: string | null
  valor: string
  interna: boolean
  correspondencia: Correspondencia
}

type Estado = 'interna' | 'vinculado' | 'sem'
const estadoDe = (l: LinhaPix): Estado => (l.interna ? 'interna' : l.correspondencia.tipo ? 'vinculado' : 'sem')

// Status só por borda esquerda e texto, sem caixa colorida.
const BORDA: Record<Estado, string> = { sem: 'border-l-warning', vinculado: 'border-l-primary', interna: 'border-l-border' }

function EstadoTexto({ l }: { l: LinhaPix }) {
  const e = estadoDe(l)
  if (e === 'interna') return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Building2 size={12} /> Transferência interna</span>
  if (e === 'vinculado') return <span className="text-xs font-medium text-primary-text">{rotuloCorrespondencia(l.correspondencia)}</span>
  return <span className="text-xs font-medium text-warning">Sem correspondência</span>
}

const Remetente = ({ l }: { l: LinhaPix }) =>
  l.pagador ? <>{l.pagador}</> : <span className="font-normal text-muted-foreground" title="O banco não informou o remetente nesta transação">— sem remetente</span>

function Vazio() {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <TrendingUp size={32} className="mx-auto mb-2 opacity-20" />
      Nenhum recebimento no período
    </div>
  )
}

/** Celular: um cartão por transação, com o vínculo na própria linha. */
function Cartoes({ linhas }: { linhas: LinhaPix[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {linhas.map(l => (
        <li key={l.id} className={cn('rounded-lg border border-l-4 border-border bg-card p-3', BORDA[estadoDe(l)])}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate font-medium" title={l.descricao ?? ''}><Remetente l={l} /></p>
            <p className="shrink-0 font-semibold tabular-nums">{l.valor}</p>
          </div>
          <p className="text-xs text-muted-foreground">{l.data} · {l.tipo}</p>
          <div className="mt-2">
            {l.interna ? <EstadoTexto l={l} /> : <CorrespondenciaForm id={l.id} correspondencia={l.correspondencia} />}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Tablet e desktop: lista à esquerda e, à direita, o painel da transação selecionada. */
function ListaComPainel({ linhas }: { linhas: LinhaPix[] }) {
  const [sel, setSel] = useState<string | null>(null)
  // Se a seleção some (mudou o período), cai na primeira sem correspondência.
  const atual = linhas.find(l => l.id === sel) ?? linhas.find(l => estadoDe(l) === 'sem') ?? linhas[0]
  return (
    <div className="hidden grid-cols-[1fr_300px] overflow-hidden rounded-lg border border-border bg-card md:grid lg:grid-cols-[1fr_380px]">
      <ul className="divide-y divide-border">
        {linhas.map(l => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => setSel(l.id)}
              aria-current={l.id === atual.id}
              className={cn('flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left hover:bg-muted/50', BORDA[estadoDe(l)], l.id === atual.id && 'bg-muted')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium"><Remetente l={l} /></span>
                <span className="block text-xs text-muted-foreground">{l.data} · {l.tipo}</span>
              </span>
              <span className="font-semibold tabular-nums">{l.valor}</span>
            </button>
          </li>
        ))}
      </ul>
      <aside className="space-y-4 self-start border-l border-border p-5 md:sticky md:top-4">
        <div>
          <p className="text-2xl font-bold tabular-nums">{atual.valor}</p>
          <p className="text-sm text-muted-foreground">{atual.pagador ?? 'Remetente não informado pelo banco'}</p>
          <p className="text-sm text-muted-foreground">{atual.data} · {atual.tipo}</p>
          {atual.descricao && <p className="mt-1 text-xs text-muted-foreground">{atual.descricao}</p>}
        </div>
        <div className={cn('border-l-2 pl-3', atual.correspondencia.tipo ? 'border-primary' : atual.interna ? 'border-border' : 'border-warning')}>
          {/* Vinculada: o rótulo (NF, OS...) e o X de remover já aparecem no formulário abaixo. */}
          {atual.correspondencia.tipo ? <span className="text-xs font-medium text-primary-text">Vinculado</span> : <EstadoTexto l={atual} />}
        </div>
        {!atual.interna && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{atual.correspondencia.tipo ? 'Correspondência' : 'Vincular a'}</p>
            {/* key: o estado do formulário (tipo e número digitados) não pode vazar de uma transação para outra. */}
            <CorrespondenciaForm key={atual.id} id={atual.id} correspondencia={atual.correspondencia} />
          </div>
        )}
      </aside>
    </div>
  )
}

export function PixLista({ linhas }: { linhas: LinhaPix[] }) {
  if (linhas.length === 0) return <Vazio />
  return (
    <>
      <Cartoes linhas={linhas} />
      <ListaComPainel linhas={linhas} />
    </>
  )
}
