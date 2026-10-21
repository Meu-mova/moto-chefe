import Link from 'next/link'
import { Package, DollarSign, Warehouse, ArrowLeftRight, Shield, Wrench, TrendingUp, TrendingDown, Star, Trophy, HandCoins, Minus, CreditCard, Receipt, Tag } from 'lucide-react'
import { percentualDesconto, type SomaDescontos } from '@/lib/desconto'
import { calcularPremiacao } from '@/lib/premiacao'

type KPIs = {
  totalVendas: number
  faturamento: number
  estoque: number
  valorEstoque: number
  transferenciasPendentes: number
  garantiasAtivas: number
  osAbertas: number
}

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
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function calcVariacao(atual: number, anterior: number): { pct: number; label: string } | null {
  if (anterior === 0 && atual === 0) return null
  if (anterior === 0) return { pct: 100, label: '+100%' }
  const pct = ((atual - anterior) / anterior) * 100
  const rounded = Math.round(pct)
  if (rounded === 0) return { pct: 0, label: '0%' }
  return { pct: rounded, label: `${rounded > 0 ? '+' : ''}${rounded}%` }
}

function VariacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  const v = calcVariacao(atual, anterior)
  if (!v) return null

  if (v.pct > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
        <TrendingUp size={12} />
        {v.label}
      </span>
    )
  }
  if (v.pct < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
        <TrendingDown size={12} />
        {v.label}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-full">
      <Minus size={12} />
      {v.label}
    </span>
  )
}

const ADMINS = ['admin_geral', 'admin_socio']

// Desconto no card é a MARGEM — o que faltou pro piso já com as taxas, que é a
// medida completa. A quebra entre margem e preço fica no ranking, onde há espaço
// pra duas colunas. O percentual é o que dá contexto: quanto do faturamento do
// período virou desconto — o valor absoluto sozinho compara mal.
function cardDesconto(d: { qtd: number; margem: number; estimados: number }, faturamento: number) {
  const pct = percentualDesconto(d.margem, faturamento)
  const partes = [`${d.qtd} ${d.qtd === 1 ? 'venda' : 'vendas'}`]
  if (pct > 0) partes.push(`${pct}% do faturamento`)
  if (d.estimados > 0) partes.push(`${d.estimados} estimada${d.estimados === 1 ? '' : 's'}`)
  return {
    label: 'Descontos',
    value: formatCurrency(d.margem),
    icon: Tag,
    color: d.margem > 0 ? 'text-rose-600' : 'text-slate-400',
    bg: d.margem > 0 ? 'bg-rose-50' : 'bg-slate-50',
    hint: partes.join(' · '),
  }
}

// Pouco menos da metade da tela: aparece a ponta do próximo cartão, sinal de que rola.
const CARTAO_CARROSSEL = 'w-[44%] shrink-0 snap-start sm:w-auto'

export function KpiCards({ kpis, kpisAnt, papel, isVendedor: isVendedorProp, motoMaisVendida, conciliacaoPendentes = 0, faturamentoOS = { servicos: 0, pecas: 0 }, faixasOTE = [], descontos }: Props) {
  const isAdmin = ADMINS.includes(papel)
  // Quem acumula a função de vendedor sem ter o papel principal vem pela prop.
  const isVendedor = isVendedorProp ?? papel === 'vendedor'

  type Card = {
    label: string
    value: string | number
    icon: any
    color: string
    bg: string
    variacao?: { atual: number; anterior: number }
    href?: string
    highlight?: boolean
    hint?: string
  }

  const cards: Card[] = []

  if (isVendedor) {
    const comissao = kpis.faturamento * 0.005
    const comissaoAnt = kpisAnt.faturamento * 0.005
    const premiacao = calcularPremiacao(kpis.faturamento, faixasOTE)
    const premiacaoAnt = calcularPremiacao(kpisAnt.faturamento, faixasOTE)
    cards.push(
      { label: 'Motos Vendidas', value: kpis.totalVendas, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', variacao: { atual: kpis.totalVendas, anterior: kpisAnt.totalVendas } },
      { label: 'Total de Vendas', value: formatCurrency(kpis.faturamento), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50', variacao: { atual: kpis.faturamento, anterior: kpisAnt.faturamento } },
      { label: 'Mais Vendida', value: motoMaisVendida ? `${motoMaisVendida.modelo} (${motoMaisVendida.total})` : '—', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Comissão', value: formatCurrency(comissao), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50', variacao: { atual: comissao, anterior: comissaoAnt } },
      { label: 'Premiação OTE', value: formatCurrency(premiacao), icon: Trophy, color: 'text-amber-700', bg: 'bg-amber-50', variacao: { atual: premiacao, anterior: premiacaoAnt } },
    )
    if (descontos) cards.push(cardDesconto(descontos, kpis.faturamento))
  } else {
    cards.push(
      { label: 'Motos Vendidas', value: kpis.totalVendas, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', variacao: { atual: kpis.totalVendas, anterior: kpisAnt.totalVendas } },
      { label: 'Total de Venda', value: formatCurrency(kpis.faturamento), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50', variacao: { atual: kpis.faturamento, anterior: kpisAnt.faturamento } },
      { label: 'Showroom', value: kpis.estoque, icon: Warehouse, color: 'text-purple-600', bg: 'bg-purple-50' },
    )

    if (isAdmin) {
      cards.push(
        { label: 'Valor Showroom', value: formatCurrency(kpis.valorEstoque), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      )
    }

    cards.push(
      { label: 'Transf. Pendentes', value: kpis.transferenciasPendentes, icon: ArrowLeftRight, color: 'text-orange-600', bg: 'bg-orange-50' },
      { label: 'Garantias Ativas', value: kpis.garantiasAtivas, icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
      { label: 'OS Abertas', value: kpis.osAbertas, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'OS · Serviços', value: formatCurrency(faturamentoOS.servicos), icon: Receipt, color: 'text-teal-600', bg: 'bg-teal-50' },
      { label: 'OS · Peças', value: formatCurrency(faturamentoOS.pecas), icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    )

    if (isAdmin) {
      const pendentes = conciliacaoPendentes
      cards.push({
        label: 'Conciliação Cartão',
        value: pendentes > 0 ? pendentes : 'Em dia',
        icon: CreditCard,
        color: pendentes > 0 ? 'text-amber-700' : 'text-slate-400',
        bg: pendentes > 0 ? 'bg-amber-50' : 'bg-slate-50',
        href: '/conciliacao',
        highlight: pendentes > 0,
      })
    }

    if (descontos) cards.push(cardDesconto(descontos, kpis.faturamento))
  }

  const gridCols = isVendedor ? (descontos ? 'lg:grid-cols-6' : 'lg:grid-cols-5') : 'lg:grid-cols-7'

  return (
    // Celular: carrossel com rolagem lateral (variante C do protótipo da #281); a partir de sm, grade.
    <div className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 ${gridCols}`}>
      {cards.map(({ label, value, icon: Icon, color, bg, variacao, href, highlight, hint }) => {
        const inner = (
          <div className={`flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 ${highlight ? 'border-warning ring-1 ring-warning/30' : ''} ${href ? 'transition-shadow hover:shadow-sm' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <div className={`${bg} ${color} p-1.5 rounded-md`}>
                <Icon size={16} />
              </div>
            </div>
            <span className={`break-words font-bold ${highlight ? 'text-warning' : ''} ${String(value).length > 15 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}>{value}</span>
            {variacao && (
              <div className="flex items-center gap-1">
                <VariacaoBadge atual={variacao.atual} anterior={variacao.anterior} />
                <span className="text-[10px] text-slate-400">vs mês anterior</span>
              </div>
            )}
            {hint && (
              <span className="text-[10px] text-slate-400 mt-auto">{hint}</span>
            )}
            {href && (
              <span className="text-[10px] text-slate-400 mt-auto">Clique para ver →</span>
            )}
          </div>
        )
        return href
          ? <Link key={label} href={href} className={CARTAO_CARROSSEL}>{inner}</Link>
          : <div key={label} className={CARTAO_CARROSSEL}>{inner}</div>
      })}
    </div>
  )
}
