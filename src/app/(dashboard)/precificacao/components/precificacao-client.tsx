'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ModeloDialog } from './modelo-dialog'
import { toggleAtivoAction, excluirPrecificacaoAction } from '../actions'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  taxaPix: string
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  ativo: boolean
}

function fmt(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function contarTaxas(taxas: Record<string, number>) {
  return Object.values(taxas).filter(v => v > 0).length
}

type Props = { modelos: Modelo[] }

export function PrecificacaoClient({ modelos }: Props) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

  function abrirNovo() {
    setModeloEdicao(null)
    setDialogAberto(true)
  }

  function abrirEdicao(m: Modelo) {
    setModeloEdicao(m)
    setDialogAberto(true)
  }

  async function handleToggle(m: Modelo) {
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
      await excluirPrecificacaoAction(m.id)
      toast.success('Modelo excluído')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={abrirNovo} className="gap-1.5">
          <Plus size={16} /> Novo Modelo
        </Button>
      </div>

      {modelos.length === 0 ? (
        <div className="rounded-xl border bg-white py-20 text-center text-slate-400 text-sm">
          Nenhum modelo cadastrado. Clique em "Novo Modelo" para começar.
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Modelo</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Valor Mínimo</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Cartão</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Link</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Financ.</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {modelos.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{m.nome}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(m.valorMinimo)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-blue-600 font-medium">
                      {contarTaxas(m.taxasCartao)} opções
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-purple-600 font-medium">
                      {contarTaxas(m.taxasLink)} opções
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-amber-600 font-medium">
                      {contarTaxas(m.taxasFinanciamento)} opções
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={m.ativo ? 'default' : 'secondary'}>
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => abrirEdicao(m)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogAberto && (
        <ModeloDialog
          modelo={modeloEdicao}
          onClose={() => { setDialogAberto(false); setModeloEdicao(null) }}
        />
      )}
    </>
  )
}
