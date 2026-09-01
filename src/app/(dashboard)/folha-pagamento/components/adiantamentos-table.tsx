'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import { criarAdiantamentoAction, excluirAdiantamentoAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'

export type AdiantamentoRow = {
  id: string
  lojaId: string
  lojaNome: string
  usuarioId: string
  usuarioNome: string | null
  valor: string
  data: string | null
  observacao: string | null
}

export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Data vem do banco como 'YYYY-MM-DD'. Formatar com new Date() jogaria para o dia
// anterior no fuso de Brasília — o mesmo motivo de parseDataInput em @/lib/data-venda.
function fmtData(d: string | null) {
  if (!d) return '—'
  const [ano, mes, dia] = d.slice(0, 10).split('-')
  return dia + '/' + mes + '/' + ano
}

export function AdiantamentosTable({
  adiantamentos, funcionarios, mes,
}: {
  adiantamentos: AdiantamentoRow[]
  funcionarios: FuncionarioOpcao[]
  mes: string
}) {
  const [usuarioId, setUsuarioId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [pending, startTransition] = useTransition()

  const total = adiantamentos.reduce((s, a) => s + parseFloat(a.valor), 0)

  function adicionar() {
    const valorNum = parseNumeroBR(valor)
    if (valorNum === null) { toast.error('Valor inválido'); return }

    startTransition(async () => {
      try {
        await criarAdiantamentoAction({ usuarioId, mes, valor: valorNum, data: data || null, observacao })
        toast.success('Adiantamento lançado')
        setValor('')
        setData('')
        setObservacao('')
        setUsuarioId('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar adiantamento')
      }
    })
  }

  function excluir(id: string) {
    startTransition(async () => {
      try {
        await excluirAdiantamentoAction(id)
        toast.success('Adiantamento removido')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Dinheiro entregue ao funcionário antes do fechamento do mês. Desconta do total a pagar da folha e aparece
        no impresso da contabilidade. Não vira despesa nem saída de caixa — o salário cheio já é contabilizado
        quando é pago, e lançar os dois contaria o mesmo dinheiro duas vezes.
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Loja</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Data</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Valor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Observação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {adiantamentos.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">{a.usuarioNome ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500">{a.lojaNome}</td>
                <td className="px-4 py-2 text-slate-500">{fmtData(a.data)}</td>
                <td className="px-4 py-2 text-right font-medium text-amber-700">{fmt(a.valor)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{a.observacao}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => excluir(a.id)} disabled={pending} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {adiantamentos.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">Nenhum adiantamento neste mês.</td></tr>
            )}
          </tbody>
          {adiantamentos.length > 0 && (
            <tfoot className="border-t bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs font-medium text-slate-600">Total do mês</td>
                <td className="px-4 py-2 text-right font-bold text-amber-700">
                  {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Funcionário</label>
          <select
            value={usuarioId}
            onChange={e => setUsuarioId(e.target.value)}
            className="h-8 text-xs w-52 border border-slate-200 rounded-md px-2 bg-white block"
          >
            <option value="">Selecione…</option>
            {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Valor (R$)</label>
          <Input value={valor} onChange={e => setValor(e.target.value)} className="h-8 text-xs w-32" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Data do adiantamento</label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-8 text-xs w-40" />
        </div>
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs text-slate-500">Observação (opcional)</label>
          <Input
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            className="h-8 text-xs"
            placeholder="Ex.: vale do dia 05"
          />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending || !usuarioId} onClick={adicionar}>
          Lançar adiantamento
        </Button>
      </div>
    </div>
  )
}
