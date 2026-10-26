'use client'
import { useState, useTransition } from 'react'
import { atualizarBlingCodigoAction } from '../actions'
import { Check, Pencil } from 'lucide-react'

export function BlingCodigoCell({ modeloId, valor }: { modeloId: string; valor: string | null }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valor ?? '')
  const [pending, start] = useTransition()

  function salvar() {
    start(async () => {
      await atualizarBlingCodigoAction(modeloId, texto.trim())
      setEditando(false)
    })
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
          className="border rounded px-2 py-0.5 text-xs w-32 font-mono"
          placeholder="cód. produto"
          disabled={pending}
        />
        <button onClick={salvar} disabled={pending} className="text-success hover:opacity-80">
          <Check size={14} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditando(true)}
      className="flex items-center gap-1 text-xs group"
      title="Clique para editar"
    >
      <span className={texto ? 'font-mono text-foreground' : 'text-muted-foreground italic'}>
        {texto || 'não configurado'}
      </span>
      <Pencil size={11} className="text-muted-foreground group-hover:text-foreground" />
    </button>
  )
}
