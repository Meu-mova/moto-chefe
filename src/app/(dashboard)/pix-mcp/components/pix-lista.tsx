'use client'
import { useState } from 'react'
import { Building2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PainelLateral } from '@/components/painel-lateral'
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
    <ul className="space-y-3 lg:hidden">
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

/** Desktop (lg+), no padrão de Vendas: lista num cartão e, ao clicar numa linha, o painel flutuante à direita. */
function ListaComPainel({ linhas }: { linhas: LinhaPix[] }) {
  const [sel, setSel] = useState<string | null>(null)
  // Se a seleção some (mudou o período), o painel fecha.
  const atual = linhas.find(l => l.id === sel)
  return (
    <div className="hidden items-start gap-4 lg:flex">
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {linhas.map(l => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setSel(l.id)}
                aria-current={l.id === atual?.id}
                className={cn('flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left hover:bg-muted/50', BORDA[estadoDe(l)], l.id === atual?.id && 'bg-muted')}
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
      </div>
      {atual && (
        <PainelLateral key={atual.id} legenda={`PIX · ${atual.data} · ${atual.tipo}`} onFechar={() => setSel(null)}>
          <div>
            <p className="text-2xl font-bold tabular-nums">{atual.valor}</p>
            <p className="text-sm text-muted-foreground">{atual.pagador ?? 'Remetente não informado pelo banco'}</p>
            {atual.descricao && <p className="mt-1 break-words text-xs text-muted-foreground">{atual.descricao}</p>}
          </div>
          <div className={cn('border-l-2 pl-3', atual.correspondencia.tipo ? 'border-primary' : atual.interna ? 'border-border' : 'border-warning')}>
            {/* Vinculada: o rótulo (NF, OS...) e o botão "Desvincular" já aparecem no formulário abaixo. */}
            {atual.correspondencia.tipo ? <span className="text-xs font-medium text-primary-text">Vinculado</span> : <EstadoTexto l={atual} />}
          </div>
          {!atual.interna && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <p className="text-sm font-medium">{atual.correspondencia.tipo ? 'Correspondência' : 'Vincular a'}</p>
              {/* key: o estado do formulário (tipo e número digitados) não pode vazar de uma transação para outra. */}
              <CorrespondenciaForm key={atual.id} id={atual.id} correspondencia={atual.correspondencia} />
            </div>
          )}
        </PainelLateral>
      )}
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
