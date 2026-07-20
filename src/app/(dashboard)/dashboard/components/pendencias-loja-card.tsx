import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

type Props = {
  semNotaFiscal: number
  vendasPendentes: number
  osPendentes: number
  pecasPendentes: number
}

export function PendenciasLojaCard({ semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }: Props) {
  const itens = [
    {
      count: semNotaFiscal,
      href: '/vendas',
      label: `${semNotaFiscal} venda${semNotaFiscal !== 1 ? 's' : ''} sem nota fiscal`,
    },
    {
      count: vendasPendentes,
      href: '/vendas',
      label: `${vendasPendentes} venda${vendasPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
    {
      count: osPendentes,
      href: '/ordens-servico',
      label: `${osPendentes} serviço${osPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
    {
      count: pecasPendentes,
      href: '/pecas',
      label: `${pecasPendentes} peça${pecasPendentes !== 1 ? 's' : ''} com pagamento pendente de conciliação`,
    },
  ].filter(item => item.count > 0)

  if (itens.length === 0) return null

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
      <h2 className="font-semibold text-sm text-amber-800 flex items-center gap-1.5">
        <AlertTriangle size={15} className="text-amber-600" />
        Pendências da loja (últimos 30 dias)
      </h2>
      <ul className="space-y-1">
        {itens.map(item => (
          <li key={item.href + item.label}>
            <Link href={item.href} className="text-sm text-amber-800 hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
