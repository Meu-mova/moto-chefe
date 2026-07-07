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
import { criarServicoAction, atualizarServicoAction, type ServicoInput } from '../actions'

type ServicoInicial = { id: string; nome: string; tempoPrevistoMinutos: number | null; valor: string }

type Props = {
  trigger: React.ReactNode
  servicoInicial?: ServicoInicial
  onSaved?: () => void
}

type FormState = { nome: string; tempoPrevistoMinutos: string; valor: string }

const FORM_VAZIO: FormState = { nome: '', tempoPrevistoMinutos: '', valor: '' }

function paraFormState(s?: ServicoInicial): FormState {
  if (!s) return FORM_VAZIO
  return { nome: s.nome, tempoPrevistoMinutos: s.tempoPrevistoMinutos?.toString() ?? '', valor: s.valor }
}

export function ServicoForm({ trigger, servicoInicial, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(paraFormState(servicoInicial))

  const isEdit = Boolean(servicoInicial)

  function handleOpen() {
    setForm(paraFormState(servicoInicial))
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
    const input: ServicoInput = {
      nome: form.nome,
      tempoPrevistoMinutos: form.tempoPrevistoMinutos ? parseInt(form.tempoPrevistoMinutos, 10) : null,
      valor: form.valor ? parseFloat(form.valor) : 0,
    }
    setLoading(true)
    try {
      if (isEdit && servicoInicial) {
        await atualizarServicoAction(servicoInicial.id, input)
        toast.success('Serviço atualizado!')
      } else {
        await criarServicoAction(input)
        toast.success('Serviço cadastrado!')
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !servicoInicial) setForm(FORM_VAZIO) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setCampo('nome', e.target.value)}
                placeholder="Ex: Troca de óleo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tempo previsto (min)</Label>
                <Input
                  type="number"
                  value={form.tempoPrevistoMinutos}
                  onChange={e => setCampo('tempoPrevistoMinutos', e.target.value)}
                  placeholder="Ex: 60"
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
