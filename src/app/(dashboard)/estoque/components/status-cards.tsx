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
  { key: 'total'         as const, label: 'Total',       icon: Layers,       value: (c: Counts) => c.total,         text: 'text-foreground',  bg: 'bg-muted',  border: 'border-border', icon_c: 'text-muted-foreground'  },
  { key: 'caixa'         as const, label: 'Caixa',       icon: Package,      value: (c: Counts) => c.caixa,         text: 'text-foreground',  bg: 'bg-muted',  border: 'border-border', icon_c: 'text-muted-foreground'  },
  { key: 'montada'       as const, label: 'Montadas',    icon: Zap,          value: (c: Counts) => c.montada,       text: 'text-info',   bg: 'bg-info/10',   border: 'border-info/30',  icon_c: 'text-info'   },
  { key: 'disponivel'    as const, label: 'Disponíveis', icon: CheckCircle2, value: (c: Counts) => c.disponivel,    text: 'text-success',  bg: 'bg-success/10',  border: 'border-success/30', icon_c: 'text-success'  },
  { key: 'reservada'     as const, label: 'Reservadas',  icon: Clock,        value: (c: Counts) => c.reservada,     text: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/30', icon_c: 'text-warning'  },
  { key: 'em_garantia'   as const, label: 'Garantia',    icon: ShieldAlert,  value: (c: Counts) => c.em_garantia,   text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30',icon_c: 'text-warning' },
  { key: 'aguardando_nf' as const, label: 'Ag. NF',      icon: FileCheck,    value: (c: Counts) => c.aguardando_nf, text: 'text-info',   bg: 'bg-info/10',   border: 'border-info/30',  icon_c: 'text-info'   },
]

export function StatusCards({ counts }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {items.map(({ key, label, icon: Icon, value, text, bg, border, icon_c }) => (
        <div key={key} className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Icon size={14} className={icon_c} />
          </div>
          <p className={`text-2xl font-bold ${text}`}>{value(counts)}</p>
        </div>
      ))}
    </div>
  )
}
