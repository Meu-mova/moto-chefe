import { Package, DollarSign, Warehouse, ArrowLeftRight, Shield, Wrench } from 'lucide-react'

type KPIs = {
  totalVendas: number
  faturamento: number
  estoque: number
  transferenciasPendentes: number
  garantiasAtivas: number
  osAbertas: number
}

type Props = {
  kpis: KPIs
  papel: string
}

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function KpiCards({ kpis, papel }: Props) {
  const cards = [
    { label: 'Vendas', value: kpis.totalVendas, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Faturamento', value: formatCurrency(kpis.faturamento), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Estoque', value: kpis.estoque, icon: Warehouse, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  if (papel !== 'vendedor') {
    cards.push(
      { label: 'Transf. Pendentes', value: kpis.transferenciasPendentes, icon: ArrowLeftRight, color: 'text-orange-600', bg: 'bg-orange-50' },
      { label: 'Garantias Ativas', value: kpis.garantiasAtivas, icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
    )
  }

  if (papel !== 'vendedor') {
    cards.push(
      { label: 'OS Abertas', value: kpis.osAbertas, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-50' },
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-white rounded-lg border p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{label}</span>
            <div className={`${bg} ${color} p-1.5 rounded-md`}>
              <Icon size={16} />
            </div>
          </div>
          <span className="text-2xl font-bold">{value}</span>
        </div>
      ))}
    </div>
  )
}
