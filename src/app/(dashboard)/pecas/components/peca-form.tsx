'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { criarPecaAction, atualizarPecaAction, type PecaInput } from '../actions'

type PecaInicial = { id: string; nome: string; valor: string }

type Props = {
  trigger: React.ReactNode
  pecaInicial?: PecaInicial
  onSaved?: () => void
}

type FormState = { nome: string; valor: string }

const FORM_VAZIO: FormState = { nome: '', valor: '' }

function paraFormState(p?: PecaInicial): FormState {
  if (!p) return FORM_VAZIO
  return { nome: p.nome, valor: p.valor }
}

export function PecaForm({ trigger, pecaInicial, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(paraFormState(pecaInicial))

  const isEdit = Boolean(pecaInicial)

  function handleOpen() {
    setForm(paraFormState(pecaInicial))
    setOpen(true)
  }

  function setCampo(campo: keyof FormState, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    const input: PecaInput = {
      nome: form.nome,
      valor: form.valor ? parseFloat(form.valor) : 0,
    }
    setLoading(true)
    try {
      if (isEdit && pecaInicial) {
        await atualizarPecaAction(pecaInicial.id, input)
        toast.success('Peça atualizada!')
      } else {
        await criarPecaAction(input)
        toast.success('Peça cadastrada!')
      }
      setOpen(false)
      onSaved?.()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={handleOpen} className="inline-flex cursor-pointer">
        {trigger}
      </div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !pecaInicial) setForm(FORM_VAZIO) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Peça' : 'Nova Peça'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setCampo('nome', e.target.value)}
                placeholder="Ex: Pastilha de freio dianteira"
              />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput
                value={form.valor}
                onChange={v => setCampo('valor', v)}
                placeholder="0,00"
              />
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button onClick={handleSalvar} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
