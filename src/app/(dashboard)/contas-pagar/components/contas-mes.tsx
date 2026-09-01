'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, AlertTriangle, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { situacaoOcorrencia, labelBaseFormula, labelMesReferencia, type SituacaoConta } from '@/lib/contas-pagar'
import { parseNumeroBR } from '@/lib/numero-br'
import { marcarPagoAction, editarValorOcorrenciaAction, type OcorrenciaConta } from '../actions'

const fmt = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtData(d: string) {
  const [ano, mes, dia] = d.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

function fmtCompetencia(mes: string) {
  const [ano, m] = mes.split('-')
  return `${m}/${ano}`
}

const SITUACAO_BADGE: Record<SituacaoConta, { label: string; cls: string }> = {
  paga:       { label: 'Paga',        cls: 'border-green-300 text-green-700 bg-green-50' },
  vencida:    { label: 'Vencida',     cls: 'border-red-300 text-red-700 bg-red-50' },
  vence_hoje: { label: 'Vence hoje',  cls: 'border-amber-300 text-amber-800 bg-amber-50' },
  a_vencer:   { label: 'A vencer',    cls: 'border-slate-200 text-slate-600 bg-slate-50' },
}

function Linha({ o, hoje, mostrarCompetencia }: {
  o: OcorrenciaConta
  hoje: string
  mostrarCompetencia?: boolean
}) {
  const [pending, start] = useTransition()
  const situacao = situacaoOcorrencia(o, hoje)
  const badge = SITUACAO_BADGE[situacao]

  function alternar() {
    start(async () => {
      try {
        await marcarPagoAction(o.id, !o.pago)
        toast.success(o.pago ? 'Marcada como em aberto' : 'Marcada como paga')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao marcar')
      }
    })
  }

  function editarValor() {
    const informado = prompt(`Valor de "${o.descricao}" nesta competência:`, Number(o.valor).toFixed(2).replace('.', ','))
    if (informado === null) return
    const valor = parseNumeroBR(informado)
    if (valor === null) { toast.error('Valor inválido'); return }
    start(async () => {
      try {
        await editarValorOcorrenciaAction(o.id, valor)
        toast.success('Valor ajustado')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao ajustar')
      }
    })
  }

  return (
    <div className={`flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 ${o.pago ? 'bg-slate-50/60' : ''}`}>
      {/* O check é o ponto todo do módulo: um clique resolve o "a data passou e eu
          perdi o pagamento". Por isso ele fica na linha, não dentro de um dialog. */}
      <button
        onClick={alternar}
        disabled={pending}
        title={o.pago ? 'Desmarcar' : 'Marcar como paga'}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          o.pago
            ? 'border-green-600 bg-green-600 text-white'
            : situacao === 'vencida'
              ? 'border-red-300 hover:border-red-500'
              : 'border-slate-300 hover:border-slate-500'
        } disabled:opacity-40`}
      >
        {o.pago && <Check size={13} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${o.pago ? 'text-slate-400 line-through' : ''}`}>
          {o.descricao}
        </p>
        <p className="text-xs text-slate-400">
          {mostrarCompetencia && <span className="text-red-600">{fmtCompetencia(o.competencia)} · </span>}
          venc. {fmtData(o.vencimento)}
          {o.categoria ? ` · ${o.categoria}` : ''}
          {o.lojaNome ? ` · ${o.lojaNome}` : ' · empresa'}
          {o.tipo === 'automatica' && o.formulaPercentual
            ? ` · ${Number(o.formulaPercentual).toLocaleString('pt-BR')}% sobre ${labelBaseFormula(o.formulaBase ?? '').toLowerCase()} (${labelMesReferencia(o.formulaMesRef).toLowerCase()})`
            : ''}
          {o.pago && o.pagoEm ? ` · pago em ${fmtData(o.pagoEm)}${o.pagoPorNome ? ` por ${o.pagoPorNome}` : ''}` : ''}
        </p>
      </div>

      <Badge variant="outline" className={`${badge.cls} shrink-0`}>{badge.label}</Badge>

      <span className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${o.pago ? 'text-slate-400' : ''}`}>
        {fmt(o.valor)}
      </span>

      {/* Automática não edita valor: ele é recalculado enquanto não está paga, e a
          edição seria desfeita sem aviso. A action recusa também. */}
      {o.tipo !== 'automatica' && !o.pago && (
        <button onClick={editarValor} disabled={pending} title="Ajustar o valor deste mês"
          className="shrink-0 text-slate-300 hover:text-slate-600">
          <Pencil size={13} />
        </button>
      )}
      {(o.tipo === 'automatica' || o.pago) && <span className="w-[13px] shrink-0" />}
    </div>
  )
}

export function ContasMes({ doMes, atrasadas, hoje }: {
  doMes: OcorrenciaConta[]
  atrasadas: OcorrenciaConta[]
  /** 'YYYY-MM-DD' do servidor: "vencida" tem que sair do calendário de Brasília. */
  hoje: string
}) {
  const [ocultarPagas, setOcultarPagas] = useState(false)

  const total = doMes.reduce((s, o) => s + Number(o.valor), 0)
  const pago = doMes.filter(o => o.pago).reduce((s, o) => s + Number(o.valor), 0)
  const emAberto = total - pago
  const totalAtrasado = atrasadas.reduce((s, o) => s + Number(o.valor), 0)

  const visiveis = ocultarPagas ? doMes.filter(o => !o.pago) : doMes

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total do mês</p>
          <p className="mt-0.5 text-xl font-bold">{fmt(total)}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-green-600">Pago</p>
          <p className="mt-0.5 text-xl font-bold text-green-700">{fmt(pago)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Em aberto</p>
          <p className="mt-0.5 text-xl font-bold">{fmt(emAberto)}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${atrasadas.length > 0 ? 'border-red-200 bg-red-50' : 'bg-white'}`}>
          <p className={`text-xs uppercase tracking-wide ${atrasadas.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>
            Atrasadas
          </p>
          <p className={`mt-0.5 text-xl font-bold ${atrasadas.length > 0 ? 'text-red-700' : ''}`}>
            {fmt(totalAtrasado)}
          </p>
        </div>
      </div>

      {/* Atrasadas de meses anteriores vêm ANTES do mês corrente e não somem da
          tela: é exatamente o compromisso que hoje se perde quando a data passa. */}
      {atrasadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <AlertTriangle size={15} /> Atrasadas de meses anteriores ({atrasadas.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-red-200 bg-white">
            {atrasadas.map(o => <Linha key={o.id} o={o} hoje={hoje} mostrarCompetencia />)}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Do mês ({doMes.length})</h2>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={ocultarPagas}
              onChange={e => setOcultarPagas(e.target.checked)}
              className="rounded border-slate-300"
            />
            Ocultar pagas
          </label>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white">
          {visiveis.map(o => <Linha key={o.id} o={o} hoje={hoje} />)}
          {visiveis.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              {doMes.length === 0
                ? 'Nenhuma conta vence neste mês.'
                : 'Todas as contas do mês estão pagas.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
