'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TaxasForm } from './taxas-form'
import { ModeloDialog } from './modelo-dialog'
import { toggleAtivoAction, excluirModeloAction } from '../actions'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

type Taxas = {
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  ativo: boolean
}

type Props = {
  taxas: Taxas
  modelos: Modelo[]
}

function fmt(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PrecificacaoClient({ taxas, modelos }: Props) {
  const [dialogAberto, setDialogAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

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
      await excluirModeloAction(m.id)
      toast.success('Modelo excluído')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  return (
    <div className="space-y-6">
      {/* Taxas globais no topo */}
      <TaxasForm taxas={taxas} />

      {/* Lista de modelos */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Modelos</h2>
            <p className="text-xs text-slate-400 mt-0.5">{modelos.length} modelo{modelos.length !== 1 ? 's' : ''} cadastrado{modelos.length !== 1 ? 's' : ''}</p>
          </div>
          <Button
            onClick={() => { setModeloEdicao(null); setDialogAberto(true) }}
            className="gap-1.5"
          >
            <Plus size={16} /> Novo Modelo
          </Button>
        </div>

        {modelos.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Nenhum modelo cadastrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Modelo</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Valor Mínimo (PIX)</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {modelos.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{m.nome}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(m.valorMinimo)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={m.ativo ? 'default' : 'secondary'}>
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
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
              ))}
            </tbody>
          </table>
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
