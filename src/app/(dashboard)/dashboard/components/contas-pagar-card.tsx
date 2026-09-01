import Link from 'next/link'
import { AlertTriangle, ArrowRight, Receipt } from 'lucide-react'
import { situacaoOcorrencia, type SituacaoConta } from '@/lib/contas-pagar'
import type { OcorrenciaConta } from '../../contas-pagar/actions'

const fmt = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDia(d: string) {
  const [, mes, dia] = d.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

const PONTO: Record<SituacaoConta, string> = {
  paga:       'bg-green-500',
  vencida:    'bg-red-500',
  vence_hoje: 'bg-amber-500',
  a_vencer:   'bg-slate-300',
}

export function ContasPagarCard({ doMes, atrasadas, hoje }: {
  doMes: OcorrenciaConta[]
  atrasadas: OcorrenciaConta[]
  hoje: string
}) {
  // Card some quando não há nada cadastrado — o dashboard não ganha nada com uma
  // caixa vazia ocupando o topo.
  if (doMes.length === 0 && atrasadas.length === 0) return null

  const total = doMes.reduce((s, o) => s + Number(o.valor), 0)
  const emAberto = doMes.filter(o => !o.pago).reduce((s, o) => s + Number(o.valor), 0)
  const totalAtrasado = atrasadas.reduce((s, o) => s + Number(o.valor), 0)

  // Ordem da lista: atrasadas primeiro, depois o que ainda vence no mês. O que já
  // foi pago fica de fora — quem abre o MOVA quer ver o que falta.
  const aMostrar = [...atrasadas, ...doMes.filter(o => !o.pago)].slice(0, 6)
  const restantes = (atrasadas.length + doMes.filter(o => !o.pago).length) - aMostrar.length

  return (
    <div className={`rounded-lg border bg-white ${atrasadas.length > 0 ? 'border-red-300' : ''}`}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Receipt size={15} className="text-slate-500" />
          Contas a pagar
          {atrasadas.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              <AlertTriangle size={11} /> {atrasadas.length} atrasada{atrasadas.length > 1 ? 's' : ''}
            </span>
          )}
        </h2>
        <Link href="/contas-pagar" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          Ver contas <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-3 divide-x border-b">
        <div className="px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Total do mês</p>
          <p className="text-lg font-bold tabular-nums">{fmt(total)}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Em aberto</p>
          <p className="text-lg font-bold tabular-nums">{fmt(emAberto)}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className={`text-[11px] uppercase tracking-wide ${totalAtrasado > 0 ? 'text-red-500' : 'text-slate-400'}`}>
            Atrasado
          </p>
          <p className={`text-lg font-bold tabular-nums ${totalAtrasado > 0 ? 'text-red-700' : 'text-slate-300'}`}>
            {fmt(totalAtrasado)}
          </p>
        </div>
      </div>

      {aMostrar.length > 0 ? (
        <ul className="divide-y">
          {aMostrar.map(o => {
            const situacao = situacaoOcorrencia(o, hoje)
            return (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[situacao]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{o.descricao}</p>
                  <p className="text-xs text-slate-400">
                    venc. {fmtDia(o.vencimento)}
                    {situacao === 'vencida' ? ' · em atraso' : situacao === 'vence_hoje' ? ' · vence hoje' : ''}
                    {o.lojaNome ? ` · ${o.lojaNome}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${situacao === 'vencida' ? 'text-red-700' : ''}`}>
                  {fmt(o.valor)}
                </span>
              </li>
            )
          })}
          {restantes > 0 && (
            <li className="px-4 py-2 text-xs text-slate-400">+{restantes} em aberto</li>
          )}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-green-700">✓ Tudo do mês está pago.</p>
      )}
    </div>
  )
}
