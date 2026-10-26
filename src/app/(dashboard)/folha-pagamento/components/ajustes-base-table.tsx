'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import { TIPOS_AJUSTE } from '@/lib/folha'
import { criarAjusteBaseAction, excluirAjusteBaseAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'

export type AjusteRow = {
  id: string
  lojaId: string
  lojaNome: string
  tipo: string
  usuarioId: string | null
  usuarioNome: string | null
  valor: string
  observacao: string | null
}

export type LojaOpcao = { id: string; nome: string }
export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TIPO_LABEL = Object.fromEntries(TIPOS_AJUSTE.map(t => [t.valor, t.label]))

export function AjustesBaseTable({
  ajustes, lojas, funcionarios, mes,
}: {
  ajustes: AjusteRow[]
  lojas: LojaOpcao[]
  funcionarios: FuncionarioOpcao[]
  mes: string
}) {
  const [lojaId, setLojaId] = useState('')
  const [tipo, setTipo] = useState<string>('pecas')
  const [usuarioId, setUsuarioId] = useState('')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [pending, startTransition] = useTransition()

  // Só faz sentido creditar alguém da própria loja do ajuste — a action valida isso também.
  const funcionariosDaLoja = funcionarios.filter(f => f.lojaId === lojaId)

  function adicionar() {
    const valorNum = parseNumeroBR(valor)
    if (valorNum === null) { toast.error('Valor inválido'); return }

    startTransition(async () => {
      try {
        await criarAjusteBaseAction({
          lojaId,
          mes,
          tipo,
          usuarioId: usuarioId || null,
          valor: valorNum,
          observacao,
        })
        toast.success('Ajuste lançado')
        setValor('')
        setObservacao('')
        setUsuarioId('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao lançar ajuste')
      }
    })
  }

  function excluir(id: string) {
    startTransition(async () => {
      try {
        await excluirAjusteBaseAction(id)
        toast.success('Ajuste removido')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Venda que aconteceu de verdade mas não foi lançada no sistema. Entra só no cálculo da folha — não aparece
        em Financeiro, Despesas nem no estoque. O valor sempre soma à base da loja; se você escolher um funcionário,
        soma também à base individual dele. Valor negativo corrige um lançamento a maior.
      </p>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Loja</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Tipo</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Funcionário</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Valor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Motivo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {ajustes.map(a => (
              <tr key={a.id} className="hover:bg-muted">
                <td className="px-4 py-2">{a.lojaNome}</td>
                <td className="px-4 py-2">{TIPO_LABEL[a.tipo] ?? a.tipo}</td>
                <td className="px-4 py-2">{a.usuarioNome ?? <span className="text-muted-foreground">só a loja</span>}</td>
                <td className="px-4 py-2 text-right font-medium">{fmt(a.valor)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{a.observacao}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => excluir(a.id)} disabled={pending} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {ajustes.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-6">Nenhum ajuste neste mês.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-card border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Loja</label>
          <select
            value={lojaId}
            onChange={e => { setLojaId(e.target.value); setUsuarioId('') }}
            className="h-8 text-xs w-40 border border-border rounded-md px-2 bg-card block"
          >
            <option value="">Selecione…</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="h-8 text-xs w-44 border border-border rounded-md px-2 bg-card block"
          >
            {TIPOS_AJUSTE.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Funcionário (opcional)</label>
          <select
            value={usuarioId}
            onChange={e => setUsuarioId(e.target.value)}
            disabled={!lojaId}
            className="h-8 text-xs w-44 border border-border rounded-md px-2 bg-card block disabled:bg-muted"
          >
            <option value="">Só a loja</option>
            {funcionariosDaLoja.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Valor (R$)</label>
          <Input value={valor} onChange={e => setValor(e.target.value)} className="h-8 text-xs w-32" placeholder="0,00" />
        </div>
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs text-muted-foreground">Motivo</label>
          <Input
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            className="h-8 text-xs"
            placeholder="Ex.: OS lançada fora do sistema"
          />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending || !lojaId} onClick={adicionar}>
          Lançar ajuste
        </Button>
      </div>
    </div>
  )
}
