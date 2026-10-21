import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { totaisDoMes } from '@/lib/contas-pagar'
import type { OcorrenciaConta } from '../../contas-pagar/actions'
import { Secao } from './painel-secoes'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Só os totais, logo abaixo da manchete (#311): a lista fica em /contas-pagar.
// Aparece mesmo sem conta no mês, para o sócio saber que não esqueceu de cadastrar.
// O mês vai no título porque é sempre o corrente, mesmo com o dashboard filtrado em outro período.
export function ContasPagarCard({ doMes, atrasadas, hoje }: { doMes: OcorrenciaConta[]; atrasadas: OcorrenciaConta[]; hoje: string }) {
  const t = totaisDoMes(doMes, atrasadas, hoje)
  const colunas = [
    { rotulo: 'Total do mês', valor: t.total, alerta: false },
    { rotulo: 'Em aberto', valor: t.emAberto, alerta: false },
    { rotulo: t.qtdAtrasadas ? `Atrasado (${t.qtdAtrasadas})` : 'Atrasado', valor: t.atrasado, alerta: t.qtdAtrasadas > 0 },
  ]

  return (
    <Secao
      titulo={`Contas a pagar · ${MESES[Number(hoje.slice(5, 7)) - 1]}`}
      acao={
        <Link href="/contas-pagar" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          Ver contas <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      }
    >
      <dl className="grid grid-cols-3 gap-x-6 border-b border-border py-2.5">
        {colunas.map(c => (
          <div key={c.rotulo} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{c.rotulo}</dt>
            <dd className={`truncate text-base font-bold tabular-nums sm:text-lg ${c.alerta ? 'text-warning' : 'text-foreground'}`}>{fmt(c.valor)}</dd>
          </div>
        ))}
      </dl>
      {doMes.length === 0 && atrasadas.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">Nenhuma conta no mês.</p>
      )}
    </Secao>
  )
}

/** Mesma altura do card, para os indicadores não pularem quando as contas chegam. */
export function ContasPagarEsqueleto() {
  return <div aria-hidden className="h-[5.75rem] animate-pulse rounded-md bg-muted" />
}
