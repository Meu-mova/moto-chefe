'use client'
import { useMemo, useState } from 'react'
import { LancarDespesaForm } from './lancar-despesa-form'
import type { Loja } from '../types'

export type SaidaRow = {
  id: string
  data: string
  favorecidoNome: string | null
  descricao: string | null
  valor: string
  despesaId: string | null
  categoria: string | null
  lojaId: string | null
  lojaNome: string | null
  lancadoPorNome: string | null
  lancadoEm: string | null
}

type StatusFiltro = 'todas' | 'lancadas' | 'pendentes'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function SaidasTable({ saidas, lojas, categorias, podeCategorizar }: { saidas: SaidaRow[]; lojas: Loja[]; categorias: string[]; podeCategorizar: boolean }) {
  const [status, setStatus] = useState<StatusFiltro>('todas')

  const filtradas = useMemo(() => saidas.filter(s => {
    if (status === 'lancadas') return !!s.despesaId
    if (status === 'pendentes') return !s.despesaId
    return true
  }), [saidas, status])

  const opcoes: { value: StatusFiltro; label: string }[] = [
    { value: 'todas', label: `Todas (${saidas.length})` },
    { value: 'lancadas', label: `Lançadas (${saidas.filter(s => s.despesaId).length})` },
    { value: 'pendentes', label: `Não lançadas (${saidas.filter(s => !s.despesaId).length})` },
  ]

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border bg-slate-50 p-0.5 gap-0.5">
        {opcoes.map(o => (
          <button
            key={o.value}
            onClick={() => setStatus(o.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === o.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Data</th>
              <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Favorecido / Descrição</th>
              <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Valor</th>
              <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Categoria / Loja</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtradas.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                  {new Date(s.data).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">{s.favorecidoNome || '—'}</p>
                  {s.descricao && <p className="text-xs text-slate-400 truncate max-w-xs" title={s.descricao}>{s.descricao}</p>}
                </td>
                <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(Number(s.valor))}</td>
                <td className="px-4 py-2">
                  <LancarDespesaForm
                    id={s.id}
                    lojas={lojas}
                    categorias={categorias}
                    podeCategorizar={podeCategorizar}
                    jaLancado={s.despesaId ? {
                      categoria: s.categoria,
                      lojaId: s.lojaId,
                      lojaNome: s.lojaNome,
                      lancadoPorNome: s.lancadoPorNome,
                      lancadoEm: s.lancadoEm,
                    } : null}
                  />
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-8">
                  {saidas.length === 0 ? 'Nenhuma saída no período.' : 'Nenhuma saída para o filtro selecionado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
