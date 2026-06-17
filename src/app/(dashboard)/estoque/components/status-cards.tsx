import { Package, Zap, ShieldAlert, CheckCircle2, Clock, Layers, FileCheck } from 'lucide-react'

type Counts = {
  total:        number
  caixa:        number
  montada:      number
  disponivel:   number
  reservada:    number
  em_garantia:  number
  aguardando_nf: number
}

type Props = { counts: Counts }

const items = [
  { key: 'total'         as const, label: 'Total',       icon: Layers,       value: (c: Counts) => c.total,         text: 'text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-200', icon_c: 'text-slate-500'  },
  { key: 'caixa'         as const, label: 'Caixa',       icon: Package,      value: (c: Counts) => c.caixa,         text: 'text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-200', icon_c: 'text-slate-400'  },
  { key: 'montada'       as const, label: 'Montadas',    icon: Zap,          value: (c: Counts) => c.montada,       text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100',  icon_c: 'text-blue-400'   },
  { key: 'disponivel'    as const, label: 'Disponíveis', icon: CheckCircle2, value: (c: Counts) => c.disponivel,    text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-100', icon_c: 'text-green-400'  },
  { key: 'reservada'     as const, label: 'Reservadas',  icon: Clock,        value: (c: Counts) => c.reservada,     text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100', icon_c: 'text-amber-400'  },
  { key: 'em_garantia'   as const, label: 'Garantia',    icon: ShieldAlert,  value: (c: Counts) => c.em_garantia,   text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100',icon_c: 'text-orange-400' },
  { key: 'aguardando_nf' as const, label: 'Ag. NF',      icon: FileCheck,    value: (c: Counts) => c.aguardando_nf, text: 'text-teal-700',   bg: 'bg-teal-50',   border: 'border-teal-100',  icon_c: 'text-teal-400'   },
]

export function StatusCards({ counts }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {items.map(({ key, label, icon: Icon, value, text, bg, border, icon_c }) => (
        <div key={key} className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <Icon size={14} className={icon_c} />
          </div>
          <p className={`text-2xl font-bold ${text}`}>{value(counts)}</p>
        </div>
      ))}
    </div>
  )
}
