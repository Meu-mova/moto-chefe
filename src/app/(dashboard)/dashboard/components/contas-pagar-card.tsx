import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { OcorrenciaConta } from '../../contas-pagar/actions'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const soma = (contas: OcorrenciaConta[]) => contas.reduce((s, o) => s + Number(o.valor), 0)

// Só os totais, logo abaixo da manchete (#311): a lista fica em /contas-pagar.
// Aparece mesmo sem conta no mês, para o sócio saber que não esqueceu de cadastrar.
export function ContasPagarCard({ doMes, atrasadas }: { doMes: OcorrenciaConta[]; atrasadas: OcorrenciaConta[] }) {
  const totais = [
    { rotulo: 'Total do mês', valor: soma(doMes), alerta: false },
    { rotulo: 'Em aberto', valor: soma(doMes.filter(o => !o.pago)), alerta: false },
    { rotulo: atrasadas.length ? `Atrasado (${atrasadas.length})` : 'Atrasado', valor: soma(atrasadas), alerta: atrasadas.length > 0 },
  ]

  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-1.5">
        <h2 className="text-base font-bold text-foreground">Contas a pagar</h2>
        <Link href="/contas-pagar" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          Ver contas <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 border-b border-border py-2.5">
        {totais.map(t => (
          <div key={t.rotulo} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{t.rotulo}</dt>
            <dd className={`truncate text-base font-bold tabular-nums sm:text-lg ${t.alerta ? 'text-warning' : 'text-foreground'}`}>{fmt(t.valor)}</dd>
          </div>
        ))}
      </dl>
      {doMes.length === 0 && atrasadas.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">Nenhuma conta cadastrada para este mês.</p>
      )}
    </section>
  )
}
