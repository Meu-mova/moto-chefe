import Link from 'next/link'
import { type SomaDescontos } from '@/lib/desconto'
import { montarPainel, type KPIs, type Manchete, type Variacao } from '@/lib/dashboard-painel'

type Props = {
  kpis: KPIs
  kpisAnt: KPIs
  papel: string
  isVendedor?: boolean
  motoMaisVendida: { modelo: string; total: number } | null
  conciliacaoPendentes?: number
  faturamentoOS?: { servicos: number; pecas: number }
  faixasOTE?: { valorMinimoVendas: string; premiacao: string }[]
  /** Descontos aprovados no período. Ausente = período sem registro ou sem permissão. */
  descontos?: SomaDescontos
  /** Vendas por dia do período, na mesma base de valor do faturamento mostrado. */
  serieDia?: { total: number; valor: number }[]
}

const SETA: Record<Variacao['sentido'], string> = { alta: '▲', baixa: '▼', igual: '■' }
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

function Destaque({ m, serieDia }: { m: Manchete; serieDia?: Props['serieDia'] }) {
  const pontos = m.serie && serieDia ? serieDia.map(d => (m.serie === 'valor' ? d.valor : d.total)) : []
  return (
    // Celular: número à esquerda e tendência à direita, para o bloco não ficar alto e vazio.
    <div className="grid grid-cols-[1fr_42%] items-center gap-x-3 border-b border-border px-4 py-3 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-5 sm:py-4 sm:last:border-r-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{m.rotulo}</p>
        <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums text-foreground sm:text-[1.75rem]">{m.valor}</p>
        {m.variacao && (
          <p className="mt-0.5 text-xs">
            <span className={`font-semibold ${COR_VARIACAO[m.variacao.sentido]}`}>{SETA[m.variacao.sentido]} {m.variacao.texto}</span>
            <span className="text-muted-foreground"> vs <span className="hidden sm:inline">período </span>anterior ({m.anterior})</span>
          </p>
        )}
      </div>
      <Tendencia pontos={pontos} />
    </div>
  )
}

export function KpiCards({ kpis, kpisAnt, papel, isVendedor, motoMaisVendida, conciliacaoPendentes = 0, faturamentoOS = { servicos: 0, pecas: 0 }, faixasOTE = [], descontos, serieDia }: Props) {
  const { manchete, indicadores } = montarPainel({
    kpis, kpisAnt, papel, isVendedor: isVendedor ?? papel === 'vendedor',
    motoMaisVendida, conciliacaoPendentes, faturamentoOS, faixasOTE, descontos,
  })

  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-md border border-t-[3px] border-border border-t-primary bg-card sm:grid-cols-3">
        {manchete.map(m => <Destaque key={m.rotulo} m={m} serieDia={serieDia} />)}
      </div>

      <dl className="grid border-t-2 border-foreground sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
        {indicadores.map(i => {
          return (
            <div key={i.rotulo} className={`relative flex items-baseline justify-between gap-4 border-b border-border py-2.5 ${i.href ? 'hover:bg-muted' : ''}`}>
              <dt className="text-sm text-muted-foreground">
                {/* O link cobre a linha toda; dentro de <dl> ele não pode embrulhar dt e dd. */}
                {i.href ? <Link href={i.href} className="after:absolute after:inset-0">{i.rotulo}</Link> : i.rotulo}
                {i.dica && <span className="block text-xs">{i.dica}</span>}
              </dt>
              <dd className={`shrink-0 text-sm font-semibold tabular-nums ${i.alerta ? 'text-warning' : 'text-foreground'}`}>{i.valor}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
