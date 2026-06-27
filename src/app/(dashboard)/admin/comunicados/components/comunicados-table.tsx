'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleAtivoAction, excluirComunicadoAction } from '../actions'

type Comunicado = {
  id: string
  titulo: string
  conteudo: string
  ativo: boolean
  criadoEm: Date
  totalLidos: number
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
      {comunicados.map(c => (
        <div key={c.id} className="py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{c.titulo}</span>
              <Badge variant={c.ativo ? 'default' : 'secondary'}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 line-clamp-2">{c.conteudo}</p>
            <p className="text-xs text-slate-400 mt-1">
              {new Date(c.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              {' · '}
              {c.totalLidos} confirmação{c.totalLidos !== 1 ? 'ões' : ''}
            </p>
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
      ))}
    </div>
  )
}
