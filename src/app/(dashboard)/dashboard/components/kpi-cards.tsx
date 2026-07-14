import Link from 'next/link'
import { Package, DollarSign, Warehouse, ArrowLeftRight, Shield, Wrench, TrendingUp, TrendingDown, Star, Calculator, HandCoins, Minus, CreditCard, Receipt } from 'lucide-react'

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
  motoMaisVendida: { modelo: string; total: number } | null
  precoMedio: number
  conciliacaoPendentes?: number
  faturamentoOS?: number
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

export function KpiCards({ kpis, kpisAnt, papel, motoMaisVendida, precoMedio, conciliacaoPendentes = 0, faturamentoOS = 0 }: Props) {
  const isAdmin = ADMINS.includes(papel)
  const isVendedor = papel === 'vendedor'

  type Card = {
    label: string
    value: string | number
    icon: any
    color: string
    bg: string
    variacao?: { atual: number; anterior: number }
    href?: string
    highlight?: boolean
  }

  const cards: Card[] = []

  if (isVendedor) {
    const comissao = kpis.faturamento * 0.005
    const comissaoAnt = kpisAnt.faturamento * 0.005
    cards.push(
      { label: 'Motos Vendidas', value: kpis.totalVendas, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', variacao: { atual: kpis.totalVendas, anterior: kpisAnt.totalVendas } },
      { label: 'Total de Vendas', value: formatCurrency(kpis.faturamento), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50', variacao: { atual: kpis.faturamento, anterior: kpisAnt.faturamento } },
      { label: 'Mais Vendida', value: motoMaisVendida ? `${motoMaisVendida.modelo} (${motoMaisVendida.total})` : '—', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Preço Médio', value: precoMedio > 0 ? formatCurrency(precoMedio) : '—', icon: Calculator, color: 'text-cyan-600', bg: 'bg-cyan-50' },
      { label: 'Comissão', value: formatCurrency(comissao), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50', variacao: { atual: comissao, anterior: comissaoAnt } },
    )
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
      { label: 'Faturamento OS', value: formatCurrency(faturamentoOS), icon: Receipt, color: 'text-teal-600', bg: 'bg-teal-50' },
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
  }

  const gridCols = isVendedor ? 'lg:grid-cols-5' : 'lg:grid-cols-7'

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 ${gridCols} gap-4`}>
      {cards.map(({ label, value, icon: Icon, color, bg, variacao, href, highlight }) => {
        const inner = (
          <div className={`bg-white rounded-lg border p-4 flex flex-col gap-2 ${highlight ? 'border-amber-300 ring-1 ring-amber-200' : ''} ${href ? 'hover:shadow-sm transition-shadow' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <div className={`${bg} ${color} p-1.5 rounded-md`}>
                <Icon size={16} />
              </div>
            </div>
            <span className={`font-bold ${highlight ? 'text-amber-700' : ''} ${String(value).length > 15 ? 'text-lg' : 'text-2xl'}`}>{value}</span>
            {variacao && (
              <div className="flex items-center gap-1">
                <VariacaoBadge atual={variacao.atual} anterior={variacao.anterior} />
                <span className="text-[10px] text-slate-400">vs mês anterior</span>
              </div>
            )}
            {href && (
              <span className="text-[10px] text-slate-400 mt-auto">Clique para ver →</span>
            )}
          </div>
        )
        return href
          ? <Link key={label} href={href}>{inner}</Link>
          : <div key={label}>{inner}</div>
      })}
    </div>
  )
}
