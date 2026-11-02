'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { diaCurtoBrt } from '@/lib/data-venda'
import { linkDaVenda, motivoDaSefaz, temDocumento } from '@/lib/notas-emitidas'
import type { NotaEmitidaComInutilizacao } from '@/lib/queries/notas-emitidas'
import { SeloStatus } from './selo-status'
import { SituacaoInutilizacao } from './situacao-inutilizacao'

type Props = {
  /** As notas da página atual. */
  notas: NotaEmitidaComInutilizacao[]
  /** Quantas notas a lista tem ao todo, para a barra; a paginação fica fora deste componente. */
  total: number
  /** Modo Selecionar: a coluna das caixas aparece e a barra vira "N selecionadas". */
  selecionando: boolean
  onSelecionar: (ligar: boolean) => void
  marcadas: Set<string>
  onMarcar: (id: string, marcar: boolean) => void
  baixando: boolean
  onBaixar: () => void
  /** O mesmo menu da linha da tabela. */
  acoes: (nota: NotaEmitidaComInutilizacao, className?: string) => ReactNode
}

const fato = 'whitespace-nowrap'
const valor = 'font-medium text-foreground'
const link = 'text-primary-text underline-offset-4 hover:underline'

/**
 * Lista do celular (#597): um cartão por nota, com o cliente em destaque, os selos, o motivo da
 * SEFAZ em bloco só na recusada e os fatos no rodapé. A seleção para baixar só existe no modo
 * Selecionar, para a caixa não disputar espaço com o conteúdo.
 */
export function NotasCartoes({ notas, total, selecionando, onSelecionar, marcadas, onMarcar, baixando, onBaixar, acoes }: Props) {
  const qtd = marcadas.size
  return (
    <div className="md:hidden">
      <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border py-2">
        {selecionando ? (
          <>
            <span role="status" className="text-sm text-muted-foreground"><b className="font-semibold text-foreground">{qtd}</b> {qtd === 1 ? 'selecionada' : 'selecionadas'}</span>
            <span className="flex gap-2">
              <Button variant="outline" className="h-10 px-3.5" disabled={baixando} onClick={() => onSelecionar(false)}>Cancelar</Button>
              <Button className="h-10 px-3.5" disabled={qtd === 0 || baixando} onClick={onBaixar}>
                {baixando && <Loader2 className="animate-spin" />}Baixar
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground"><b className="font-semibold text-foreground">{total}</b> {total === 1 ? 'nota' : 'notas'}</span>
            <Button variant="outline" className="h-10 px-3.5" onClick={() => onSelecionar(true)}>Selecionar</Button>
          </>
        )}
      </div>
      <ul aria-label="Notas emitidas" className="flex flex-col gap-3 py-3">
        {notas.map(n => (
          <Cartao key={n.id} nota={n} selecionando={selecionando} marcada={marcadas.has(n.id)} onMarcar={marcar => onMarcar(n.id, marcar)}>
            {acoes(n, '-mt-2.5 size-11 self-start')}
          </Cartao>
        ))}
      </ul>
    </div>
  )
}

function Cartao({ nota: n, selecionando, marcada, onMarcar, children }: {
  nota: NotaEmitidaComInutilizacao; selecionando: boolean; marcada: boolean; onMarcar: (marcar: boolean) => void; children: ReactNode
}) {
  const doc = temDocumento(n)
  const venda = linkDaVenda(n)
  const motivo = n.categoria === 'recusada' ? motivoDaSefaz(n.motivoStatus) : null
  return (
    <li className={`grid gap-x-1 rounded-xl border border-border bg-card py-4 pr-1 ${selecionando ? 'grid-cols-[44px_1fr_44px] pl-1' : 'grid-cols-[1fr_44px] pl-4'}`}>
      {selecionando && (
        <label className="-mt-2.5 flex size-11 items-center justify-center self-start">
          <input type="checkbox" aria-label={`Selecionar a nota ${n.numero ?? ''}`} className="size-5 accent-primary disabled:opacity-40"
            disabled={!doc} title={doc ? undefined : 'Sem documento para baixar'} checked={marcada} onChange={e => onMarcar(e.target.checked)} />
        </label>
      )}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className={`truncate text-base leading-6 font-semibold ${n.clienteNome ? '' : 'text-muted-foreground'}`}>{n.clienteNome ?? 'Sem cliente'}</p>
          <div className="flex gap-2"><SeloStatus nota={n} /><SituacaoInutilizacao decisao={n.inutilizacao} /></div>
        </div>
        {motivo && (
          <div className="rounded-lg bg-muted px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Motivo da SEFAZ{motivo.codigo != null && ` (${motivo.codigo})`}</p>
            <p className="line-clamp-2 text-[13px]/[18px] break-words">{motivo.texto}</p>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-border pt-3 text-[13px]/5 text-muted-foreground tabular-nums">
          <span className={fato}>NF <b className={valor}>{n.numero ?? '-'}</b></span>
          <span className={fato}>Série <b className={valor}>{n.serie ?? '-'}</b></span>
          <span className={fato}>
            Venda <b className={valor}>{n.vendaNumero == null ? '-' : venda ? <Link href={venda} className={link}>#{n.vendaNumero}</Link> : `#${n.vendaNumero}`}</b>
          </span>
          <span className="ml-auto">{diaCurtoBrt(n.criadoEm)}</span>
        </div>
      </div>
      {children}
    </li>
  )
}
