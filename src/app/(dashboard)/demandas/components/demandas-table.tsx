'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { darBaixaAction } from '../actions'

type Demanda = {
  id: string
  modelo: string
  cor: string
  lojaNome: string
  solicitanteNome: string
  criadoEm: Date
}

type Props = { demandas: Demanda[]; isAdmin: boolean }

export function DemandasTable({ demandas, isAdmin }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleBaixa(id: string) {
    setLoadingId(id)
    try {
      await darBaixaAction(id)
      toast.success('Baixa dada com sucesso')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao dar baixa')
    } finally {
      setLoadingId(null)
    }
  }

  if (demandas.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-12">
        Nenhuma demanda registrada.
      </p>
    )
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Modelo</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Cor</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Loja</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Solicitante</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
            {isAdmin && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {demandas.map(d => (
            <tr key={d.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{d.modelo}</td>
              <td className="px-4 py-3 text-slate-600">{d.cor}</td>
              <td className="px-4 py-3 text-slate-600">{d.lojaNome}</td>
              <td className="px-4 py-3 text-slate-600">{d.solicitanteNome}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
              </td>
              {isAdmin && (
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingId === d.id}
                    onClick={() => handleBaixa(d.id)}
                  >
                    {loadingId === d.id ? 'Aguarde…' : 'Dar baixa'}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
