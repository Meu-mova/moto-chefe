import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { montarPainel, type EntradaPainel, type Manchete, type Variacao } from '@/lib/dashboard-painel'

type SerieDia = { total: number; valor: number }[]

// U+FE0E pede a forma de texto: sem ele o iOS pode desenhar ▲ como emoji.
const SETA: Record<Variacao['sentido'], string> = { alta: '▲\uFE0E', baixa: '▼\uFE0E', igual: '■\uFE0E' }
const COR_VARIACAO: Record<Variacao['sentido'], string> = { alta: 'text-primary-text', baixa: 'text-destructive', igual: 'text-muted-foreground' }

// Acumulado do período: mostra o ritmo, não o sobe e desce de cada dia.
function Tendencia({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) return null
  let soma = 0
  const acumulado = pontos.map(v => (soma += v))
  const max = Math.max(...acumulado, 1)
  const coords = acumulado.map((v, i) => `${(i / (acumulado.length - 1)) * 100},${30 - (v / max) * 28}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden className="h-10 w-full overflow-visible sm:mt-3 sm:h-8">
      <polyline points={coords} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-primary" />
    </svg>
  )
}

function Destaque({ m, serieDia }: { m: Manchete; serieDia?: SerieDia }) {
  const pontos = m.serie && serieDia ? serieDia.map(d => d[m.serie === 'valor' ? 'valor' : 'total']) : []
  const comTendencia = pontos.length >= 2
  return (
    // Celular: número à esquerda e tendência à direita, para o bloco não ficar alto e vazio.
    <div className={`grid ${comTendencia ? 'grid-cols-[1fr_42%]' : 'grid-cols-1'} items-center gap-x-3 border-b border-border px-4 py-3 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-5 sm:py-4 sm:last:border-r-0`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{m.rotulo}</p>
        <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums text-foreground sm:text-3xl">{m.valor}</p>
        {m.variacao && (
          <p className="mt-0.5 text-xs">
            <span className={`font-semibold ${COR_VARIACAO[m.variacao.sentido]}`}>{SETA[m.variacao.sentido]} {m.variacao.texto}</span>
            <span className="text-muted-foreground"> vs <span className="hidden sm:inline">período </span>anterior ({m.anterior})</span>
          </p>
        )}
      </div>
      {comTendencia && <Tendencia pontos={pontos} />}
    </div>
  )
}

/** serieDia: vendas por dia do período, na mesma base de valor (bruta ou líquida) do faturamento. */
export function PainelIndicadores({ entrada, serieDia }: { entrada: EntradaPainel; serieDia?: SerieDia }) {
  const { manchete, indicadores } = montarPainel(entrada)

  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-md border border-t-[3px] border-border border-t-primary bg-card sm:grid-cols-3">
        {manchete.map(m => <Destaque key={m.rotulo} m={m} serieDia={serieDia} />)}
      </div>

      <dl className="grid border-t-2 border-foreground sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
        {indicadores.map(i => (
            <div key={i.rotulo} className={`relative flex items-baseline justify-between gap-4 border-b border-border py-2.5 ${i.href ? 'hover:bg-muted' : ''}`}>
              <dt className="text-sm text-muted-foreground">
                {/* O link cobre a linha toda; dentro de <dl> ele não pode embrulhar dt e dd. */}
                {i.href ? <Link href={i.href} className="after:absolute after:inset-0">{i.rotulo}</Link> : i.rotulo}
                {i.dica && <span className="block text-xs">{i.dica}</span>}
              </dt>
              <dd className={`flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums ${i.alerta ? 'text-warning' : 'text-foreground'}`}>
                {i.valor}
                {i.href && <ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
              </dd>
            </div>
        ))}
      </dl>
    </div>
  )
}
