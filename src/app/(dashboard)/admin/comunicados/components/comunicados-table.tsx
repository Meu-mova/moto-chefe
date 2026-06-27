'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock } from 'lucide-react'
import { toggleAtivoAction, excluirComunicadoAction } from '../actions'

type Comunicado = {
  id: string
  titulo: string
  conteudo: string
  ativo: boolean
  dataPostagem: Date | null
  criadoEm: Date
  totalLidos: number
}

function statusComunicado(c: Comunicado): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (!c.ativo) return { label: 'Inativo', variant: 'secondary' }
  if (c.dataPostagem && new Date(c.dataPostagem) > new Date()) return { label: 'Agendado', variant: 'outline' }
  return { label: 'Ativo', variant: 'default' }
}

export function ComunicadosTable({ comunicados }: { comunicados: Comunicado[] }) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleToggle(id: string, ativo: boolean) {
    setLoading(id)
    await toggleAtivoAction(id, !ativo)
    setLoading(null)
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este comunicado? Todos os registros de confirmação também serão apagados.')) return
    setLoading(id)
    await excluirComunicadoAction(id)
    setLoading(null)
  }

  if (comunicados.length === 0) {
    return <p className="text-sm text-slate-400 py-4">Nenhum comunicado criado ainda.</p>
  }

  return (
    <div className="divide-y">
      {comunicados.map(c => {
        const { label, variant } = statusComunicado(c)
        const agendado = c.dataPostagem && new Date(c.dataPostagem) > new Date()
        return (
          <div key={c.id} className="py-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{c.titulo}</span>
                <Badge variant={variant}>{label}</Badge>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">{c.conteudo}</p>
              <div className="flex items-center gap-3 mt-1">
                {agendado ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <Clock size={11} />
                    Postagem em {new Date(c.dataPostagem!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {new Date(c.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  · {c.totalLidos} confirmação{c.totalLidos !== 1 ? 'ões' : ''}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={loading === c.id}
                onClick={() => handleToggle(c.id, c.ativo)}
              >
                {c.ativo ? 'Desativar' : 'Ativar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading === c.id}
                onClick={() => handleExcluir(c.id)}
                className="text-red-500 hover:text-red-700"
              >
                Excluir
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
