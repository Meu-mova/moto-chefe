'use client'
import { useRouter } from 'next/navigation'

export function MesSelectorFolha({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  return (
    <input
      type="month"
      value={mesAtual}
      onChange={e => router.push(`/folha-pagamento?mes=${e.target.value}`)}
      className="border border-border rounded-md px-3 py-1.5 text-sm bg-card"
    />
  )
}
