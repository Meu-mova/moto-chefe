'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { ModeloDialog, type ModeloEditavel } from './modelo-dialog'

export function ModeloFormButton({ modelo }: { modelo?: ModeloEditavel }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {modelo ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Editar modelo">
          <Pencil size={14} />
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Novo Modelo
        </Button>
      )}
      {open && <ModeloDialog modelo={modelo} onClose={() => setOpen(false)} />}
    </>
  )
}
