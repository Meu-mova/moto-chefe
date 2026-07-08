'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TaxasForm } from './taxas-form'
import { ModeloDialog } from './modelo-dialog'
import { toggleAtivoAction, excluirModeloAction } from '../actions'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, TrendingUp, AlertTriangle } from 'lucide-react'

type Taxas = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  custo: string | null
  ativo: boolean
  estoqueDisponivel: number
}

type Props = {
  taxas: Taxas
  modelos: Modelo[]
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtBRLStr(v: string | null) {
  if (!v) return '—'
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Margem = { reais: number; pct: number }

function calcMargem(valorMinimo: string, custo: string | null): Margem | null {
  if (!custo) return null
  const vMin = parseFloat(valorMinimo)
  const vCusto = parseFloat(custo)
  if (!vCusto || !vMin) return null
  return { reais: vMin - vCusto, pct: ((vMin - vCusto) / vMin) * 100 }
}

function corMargem(pct: number) {
  if (pct >= 20) return { badge: 'text-green-700 bg-green-50 border-green-200', text: 'text-green-700' }
  if (pct >= 10) return { badge: 'text-yellow-700 bg-yellow-50 border-yellow-200', text: 'text-yellow-700' }
  return { badge: 'text-red-700 bg-red-50 border-red-200', text: 'text-red-700' }
}

export function PrecificacaoClient({ taxas, modelos }: Props) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

  async function handleToggle(m: Modelo) {
    if (m.ativo && m.estoqueDisponivel > 0) {
      const confirmado = confirm(
        `"${m.nome}" tem ${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} disponíve${m.estoqueDisponivel !== 1 ? 'is' : 'l'} em estoque.\n\nDesativar remove o modelo do Simulador, mas o estoque continua disponível para venda. Deseja continuar?`
      )
      if (!confirmado) return
    }
    try {
      await toggleAtivoAction(m.id, !m.ativo)
      toast.success(m.ativo ? 'Modelo desativado' : 'Modelo ativado')
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleExcluir(m: Modelo) {
    if (!confirm(`Excluir "${m.nome}" permanentemente?`)) return
    try {
      await excluirModeloAction(m.id)
      toast.success('Modelo excluído')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const temCusto = modelos.some(m => m.custo)

  return (
    <div className="space-y-6">
      {/* Taxas globais no topo */}
      <TaxasForm taxas={taxas} />

      {/* Lista de modelos */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Modelos</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {modelos.length} modelo{modelos.length !== 1 ? 's' : ''} cadastrado{modelos.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => { setModeloEdicao(null); setDialogAberto(true) }} className="gap-1.5">
            <Plus size={16} /> Novo Modelo
          </Button>
        </div>

        {modelos.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Nenhum modelo cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Modelo</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Custo</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Valor Mínimo (PIX)</th>
                  {temCusto && (
                    <>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">
                        <span className="flex items-center justify-end gap-1">
                          <TrendingUp size={12} />Margem R$
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Margem %</th>
                    </>
                  )}
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelos.map(m => {
                  const margem = calcMargem(m.valorMinimo, m.custo)
                  const cor = margem ? corMargem(margem.pct) : null
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{m.nome}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">
                        {fmtBRLStr(m.custo)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        {fmtBRL(parseFloat(m.valorMinimo))}
                      </td>
                      {temCusto && (
                        <>
                          <td className="px-4 py-3 text-right font-mono">
                            {margem && cor ? (
                              <span className={`font-semibold ${cor.text}`}>{fmtBRL(margem.reais)}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {margem && cor ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cor.badge}`}>
                                {margem.pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Badge variant={m.ativo ? 'default' : 'secondary'}>
                            {m.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                          {!m.ativo && m.estoqueDisponivel > 0 && (
                            <span
                              title={`${m.estoqueDisponivel} moto${m.estoqueDisponivel !== 1 ? 's' : ''} disponíve${m.estoqueDisponivel !== 1 ? 'is' : 'l'} em estoque, mas fora do Simulador`}
                              className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium"
                            >
                              <AlertTriangle size={12} />
                              {m.estoqueDisponivel} em estoque
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => { setModeloEdicao(m); setDialogAberto(true) }}
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleToggle(m)}
                            title={m.ativo ? 'Desativar' : 'Ativar'}
                            className={m.ativo ? 'text-slate-400' : 'text-green-600'}
                          >
                            {m.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleExcluir(m)}
                            className="text-red-400 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogAberto && (
        <ModeloDialog
          modelo={modeloEdicao}
          onClose={() => { setDialogAberto(false); setModeloEdicao(null) }}
        />
      )}
    </div>
  )
}
