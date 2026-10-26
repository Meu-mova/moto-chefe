'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { salvarApelidosAction } from '../actions'
import { Check, Pencil } from 'lucide-react'

/**
 * Apelidos que as notas de entrada usam para este modelo, separados por vírgula.
 *
 * A LAIOUNS escreve "DRIFT" no infCpl para o DRIFT CAR e "G5" para o PATINETE
 * G5; sem o de-para o chassi não encontra a ficha fiscal do item e a moto entra
 * sem tributação. Edição inline no mesmo molde do Cód. Bling.
 */
export function ApelidosCell({ modeloId, valores }: { modeloId: string; valores: string[] }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valores.join(', '))
  const [pending, start] = useTransition()

  function salvar() {
    start(async () => {
      try {
        await salvarApelidosAction(modeloId, texto)
        setEditando(false)
      } catch (e) {
        // A action recusa apelido que já é de outro modelo e diz de quem é.
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar apelidos')
      }
    })
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') salvar()
            if (e.key === 'Escape') { setTexto(valores.join(', ')); setEditando(false) }
          }}
          className="border rounded px-2 py-0.5 text-xs w-40 font-mono"
          placeholder="DRIFT, G5"
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
      title="Nomes que as notas de entrada usam para este modelo"
    >
      <span className={valores.length ? 'font-mono text-foreground' : 'text-muted-foreground italic'}>
        {valores.length ? valores.join(', ') : 'nenhum'}
      </span>
      <Pencil size={11} className="text-muted-foreground group-hover:text-foreground" />
    </button>
  )
}
