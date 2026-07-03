import { Package, Zap, XCircle, CheckCircle2 } from 'lucide-react'

export function MotoStatusIcon({ status }: { status: string }) {
  if (status === 'montada') {
    return (
      <span className="flex items-center gap-1 text-green-600 font-medium text-sm">
        <Zap size={15} className="fill-green-500 text-green-600" />
        Montada
      </span>
    )
  }
  if (status === 'em_garantia') {
    return (
      <span className="flex items-center gap-1 text-red-600 font-medium text-sm">
        <XCircle size={15} className="fill-red-100" />
        Garantia
      </span>
    )
  }
  if (status === 'vendida') {
    return (
      <span className="flex items-center gap-1 text-teal-700 font-medium text-sm">
        <CheckCircle2 size={15} className="text-teal-500" />
        Vendida
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-slate-500 text-sm">
      <Package size={15} />
      Caixa
    </span>
  )
}
