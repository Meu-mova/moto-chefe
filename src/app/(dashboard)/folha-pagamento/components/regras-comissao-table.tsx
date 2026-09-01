'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Trash2, CalendarX } from 'lucide-react'
import { BASES_COMISSAO, TIPOS_REGRA, labelDaBase, regraVigenteNoMes, type RegraFolha } from '@/lib/folha'
import { parseNumeroBR } from '@/lib/numero-br'
import { criarRegraComissaoAction, encerrarRegraComissaoAction, excluirRegraComissaoAction } from '../actions'

export type RegraRow = RegraFolha & { usuarioNome: string; lojaNome: string | null }
export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

function fmtMes(mes: string | null, fallback: string) {
  if (!mes) return fallback
  const [ano, m] = mes.split('-')
  return `${m}/${ano}`
}

export function RegrasComissaoTable({ regras, funcionarios, mes }: {
  regras: RegraRow[]
  funcionarios: FuncionarioOpcao[]
  /** Mês do recorte da folha. Serve para marcar quais regras estão valendo nele. */
  mes: string
}) {
  const [usuarioId, setUsuarioId] = useState('')
  const [tipo, setTipo] = useState('comissao')
  const [base, setBase] = useState('padrao')
  const [percentual, setPercentual] = useState('')
  const [vigenciaInicio, setVigenciaInicio] = useState(mes)
  const [vigenciaFim, setVigenciaFim] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pending, startTransition] = useTransition()

  function adicionar() {
    const percentualNum = parseNumeroBR(percentual)
    if (percentualNum === null) { toast.error('Percentual inválido'); return }

    startTransition(async () => {
      try {
        await criarRegraComissaoAction({
          usuarioId, tipo, base,
          percentual: percentualNum,
          vigenciaInicio: vigenciaInicio || null,
          vigenciaFim: vigenciaFim || null,
          descricao,
        })
        toast.success('Regra cadastrada')
        setPercentual('')
        setDescricao('')
        setVigenciaFim('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar regra')
      }
    })
  }

  function encerrar(id: string) {
    const informado = prompt('Encerrar a regra a partir de qual mês? (formato AAAA-MM)\n\nA regra continua valendo até o mês informado, inclusive — os meses já pagos não mudam.', mes)
    if (informado === null) return
    startTransition(async () => {
      try {
        await encerrarRegraComissaoAction(id, informado.trim())
        toast.success('Regra encerrada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao encerrar')
      }
    })
  }

  function excluir(id: string) {
    if (!confirm('Apagar a regra de vez?\n\nEla some também dos meses em que valeu — reabrir uma folha antiga vai mostrar valor diferente do que foi pago.\n\nPara só parar de valer daqui pra frente, use "Encerrar".')) return
    startTransition(async () => {
      try {
        await excluirRegraComissaoAction(id)
        toast.success('Regra removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  const selectCls = 'h-8 text-xs border border-slate-200 rounded-md px-2 bg-white block'

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Cada funcionário pode ter <strong>várias regras</strong>, de comissão e de premiação. Regras do mesmo tipo
        somam. A vigência protege o passado: sem mês de início a regra vale desde sempre, e encerrar uma regra
        não muda os meses já pagos.
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Tipo</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Base de cálculo</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">%</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Vigência</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Observação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {regras.map(r => {
              const vigente = regraVigenteNoMes(r, mes)
              return (
                <tr key={r.id} className={`hover:bg-slate-50 ${vigente ? '' : 'text-slate-400'}`}>
                  <td className="px-4 py-2">
                    <p className={vigente ? 'font-medium' : ''}>{r.usuarioNome}</p>
                    <p className="text-xs text-slate-400">{r.lojaNome ?? '—'}</p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={r.tipo === 'premiacao'
                        ? 'border-violet-300 text-violet-700 bg-violet-50'
                        : 'border-teal-300 text-teal-700 bg-teal-50'}
                    >
                      {r.tipo === 'premiacao' ? 'Premiação' : 'Comissão'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">{labelDaBase(r.base)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {parseFloat(r.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })}%
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {fmtMes(r.vigenciaInicio, 'desde sempre')} → {fmtMes(r.vigenciaFim, 'sem fim')}
                    {/* Sem esta marca, uma regra futura ou encerrada parece estar
                        valendo e alguém cadastra a mesma coisa duas vezes. */}
                    {!vigente && <span className="block text-slate-400">não vale em {fmtMes(mes, mes)}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.descricao}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => encerrar(r.id)}
                      disabled={pending}
                      title="Encerrar a partir de um mês (preserva o histórico)"
                      className="text-slate-400 hover:text-amber-600 mr-2"
                    >
                      <CalendarX size={14} />
                    </button>
                    <button
                      onClick={() => excluir(r.id)}
                      disabled={pending}
                      title="Apagar de vez"
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {regras.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-6">Nenhuma regra cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Funcionário</label>
          <select value={usuarioId} onChange={e => setUsuarioId(e.target.value)} className={`${selectCls} w-48`}>
            <option value="">Selecione…</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${selectCls} w-32`}>
            {TIPOS_REGRA.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Base de cálculo</label>
          <select value={base} onChange={e => setBase(e.target.value)} className={`${selectCls} w-56`}>
            {BASES_COMISSAO.map(b => <option key={b.valor} value={b.valor}>{b.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Percentual (%)</label>
          <Input value={percentual} onChange={e => setPercentual(e.target.value)} className="h-8 text-xs w-24" placeholder="0,2" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Vale a partir de</label>
          <Input type="month" value={vigenciaInicio} onChange={e => setVigenciaInicio(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Até (opcional)</label>
          <Input type="month" value={vigenciaFim} onChange={e => setVigenciaFim(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs text-slate-500">Observação</label>
          <Input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            className="h-8 text-xs"
            placeholder="Ex.: premiação combinada em setembro"
          />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending || !usuarioId} onClick={adicionar}>
          Cadastrar regra
        </Button>
      </div>
    </div>
  )
}
