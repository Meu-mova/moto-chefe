'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react'
import { ModeloDialog, type ModeloEditavel } from './modelo-dialog'

export function ModeloFormButton({ modelo, ajuste = false, comPreco = false }: { modelo?: ModeloEditavel; ajuste?: boolean; comPreco?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {modelo && ajuste ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Ajustar modelo" title="Ajustar para a sua Conta">
          <SlidersHorizontal size={14} />
        </Button>
      ) : modelo ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Editar modelo">
          <Pencil size={14} />
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Novo Modelo
        </Button>
      )}
      {open && <ModeloDialog modelo={modelo} ajuste={ajuste} comPreco={comPreco} onClose={() => setOpen(false)} />}
    </>
  )
}
