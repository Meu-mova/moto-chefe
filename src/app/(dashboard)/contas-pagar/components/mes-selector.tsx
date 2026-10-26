'use client'
import { useRouter } from 'next/navigation'

// Cópia local em vez de reaproveitar o da folha: aquele navega para
// /folha-pagamento no hardcode, e generalizá-lo mexeria em quatro telas que não
// têm nada a ver com esta entrega.
export function MesSelectorContas({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  return (
    <input
      type="month"
      value={mesAtual}
      onChange={e => router.push(`/contas-pagar?mes=${e.target.value}`)}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
    />
  )
}
