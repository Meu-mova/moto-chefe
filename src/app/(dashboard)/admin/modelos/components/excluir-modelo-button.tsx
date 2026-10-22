'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { excluirModeloAction } from '../actions'

export function ExcluirModeloButton({ id, nome }: { id: string; nome: string }) {
  const [pending, start] = useTransition()
  function excluir() {
    if (!confirm(`Excluir o modelo "${nome}"?`)) return
    start(async () => {
      try {
        await excluirModeloAction(id)
        toast.success('Modelo excluído')
      } catch (e) {
        // Recusa quando alguma moto ou demanda já usa o modelo.
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      }
    })
  }
  return (
    <Button variant="ghost" size="sm" onClick={excluir} disabled={pending} aria-label="Excluir modelo"
      className="text-destructive hover:bg-destructive/10">
      <Trash2 size={14} />
    </Button>
  )
}
