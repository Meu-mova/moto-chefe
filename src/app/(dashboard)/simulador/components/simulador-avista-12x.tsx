'use client'
import { useState } from 'react'
import { fmtBRL } from '@/lib/preco-minimo'
import { destaqueAvista12x, type DestaqueAvista12x } from '@/lib/simulador-padrao'
import { htmlAvista12x } from '@/lib/simulador-impressao'
import { FreteSimulador } from './frete-simulador'
import { SimuladorCasco, BotaoImprimir, abrirImpressao } from './simulador-casco'
import type { ResultadoFrete } from '../actions'

/**
 * Simulador no padrão 'avista_12x' do grupo: o PIX/dinheiro (o valor mínimo) em destaque e o
 * total em 12x digitado por modelo na Precificação, sem taxa de cartão. O padrão 'taxas'
 * continua no SimuladorClient.
 */

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  valor12x: string | null
  imagemUrl: string | null
}

type Props = {
  modelos: Modelo[]
  lojasFrete: { id: string; nome: string; temCep: boolean }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
}

export function SimuladorAvista12x({ modelos, ...resto }: Props) {
  return <SimuladorCasco modelos={modelos}>{modelo => <ResultadoAvista12x modelo={modelo} {...resto} />}</SimuladorCasco>
}

/** Miolo do padrão para um modelo escolhido: bloco PIX e 12x, frete, totais com frete e impressão. */
export function ResultadoAvista12x({ modelo, lojasFrete, isAdmin, lojaUsuarioId }: Omit<Props, 'modelos'> & { modelo: Modelo }) {
  const [frete, setFrete] = useState<ResultadoFrete | null>(null)
  const freteOk = frete?.ok ? frete : null
  const d = destaqueAvista12x(
    parseFloat(modelo.valorMinimo),
    modelo.valor12x ? parseFloat(modelo.valor12x) : null,
    freteOk ? freteOk.custo : null,
  )

  function imprimir() {
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    abrirImpressao(htmlAvista12x(modelo, d, freteOk ? freteOk.kmIdaEVolta : null, hoje))
  }

  return (
    <>
      <PixEm12x d={d} />
      <FreteSimulador lojas={lojasFrete} isAdmin={isAdmin} lojaUsuarioId={lojaUsuarioId} onResultado={setFrete} />
      {d.comFrete && (
        <div className="rounded-xl border px-4 py-3 space-y-1.5">
          <Linha rotulo="PIX + frete" valor={fmtBRL(d.comFrete.pix)} />
          {d.comFrete.parcela12x !== null && <Linha rotulo="12x + frete" valor={`12x de ${fmtBRL(d.comFrete.parcela12x)}`} />}
        </div>
      )}
      <div className="flex justify-end">
        <BotaoImprimir onClick={imprimir} className="w-full sm:w-auto" />
      </div>
    </>
  )
}

function PixEm12x({ d }: { d: DestaqueAvista12x }) {
  const desconto = [d.descontoPix ? `${d.descontoPix}% de desconto` : '', d.economiaPix ? `economia de ${fmtBRL(d.economiaPix)} sobre o 12x` : '']
    .filter(Boolean).join(', ')
  return (
    <div className="rounded-2xl border-2 border-success/45 bg-success/8 p-4 sm:p-6 grid gap-3 sm:gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="text-sm font-semibold text-success">À vista no PIX ou dinheiro</p>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight text-success tabular-nums">{fmtBRL(d.pix)}</p>
        {desconto && <p className="text-sm font-semibold text-success mt-1">{desconto}</p>}
      </div>
      <div className="border-t sm:border-t-0 sm:border-l border-success/30 pt-3 sm:pt-0 sm:pl-5 sm:min-w-56">
        {d.total12x !== null && d.parcela12x !== null ? (
          <>
            <p className="text-sm text-muted-foreground">ou no cartão</p>
            <p className="text-2xl font-bold text-info tabular-nums">12x de {fmtBRL(d.parcela12x)}</p>
            <p className="text-sm text-muted-foreground">total {fmtBRL(d.total12x)}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem valor em 12x para este modelo. Defina na Precificação.</p>
        )}
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-bold text-foreground tabular-nums">{valor}</span>
    </div>
  )
}
