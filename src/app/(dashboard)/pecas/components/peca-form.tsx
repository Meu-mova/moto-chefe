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

type PecaInicial = { id: string; nome: string; valor: string; quantidadeEstoque: number }

type Props = {
  trigger: React.ReactNode
  pecaInicial?: PecaInicial
  onSaved?: () => void
  /** Pré-preenche o nome — o que o balconista já digitou na busca da venda. */
  nomeInicial?: string
  /** Só no cadastro: devolve a peça criada pra quem chamou já poder usá-la. */
  onCriada?: (peca: PecaInicial) => void
  /** O wrapper do trigger é inline por padrão; item de menu precisa ocupar a linha. */
  triggerClassName?: string
}

type FormState = { nome: string; valor: string; quantidadeEstoque: string }

const FORM_VAZIO: FormState = { nome: '', valor: '', quantidadeEstoque: '0' }

function paraFormState(p?: PecaInicial, nomeInicial?: string): FormState {
  if (!p) return { ...FORM_VAZIO, nome: nomeInicial ?? '' }
  return { nome: p.nome, valor: p.valor, quantidadeEstoque: String(p.quantidadeEstoque) }
}

export function PecaForm({
  trigger,
  pecaInicial,
  onSaved,
  nomeInicial,
  onCriada,
  triggerClassName = 'inline-flex cursor-pointer',
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(paraFormState(pecaInicial, nomeInicial))

  const isEdit = Boolean(pecaInicial)

  function handleOpen() {
    // Relê o nome digitado a cada abertura — o `useState` só valeu na primeira.
    setForm(paraFormState(pecaInicial, nomeInicial))
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
      quantidadeEstoque: form.quantidadeEstoque ? parseInt(form.quantidadeEstoque, 10) : 0,
    }
    setLoading(true)
    try {
      if (isEdit && pecaInicial) {
        await atualizarPecaAction(pecaInicial.id, input)
        toast.success('Peça atualizada!')
      } else {
        const nova = await criarPecaAction(input)
        toast.success('Peça cadastrada!')
        onCriada?.(nova)
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
      <div onClick={handleOpen} className={triggerClassName}>
        {trigger}
      </div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !pecaInicial) setForm(FORM_VAZIO) }}>
        <DialogContent className="sm:max-w-md">
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
            <div className="space-y-1">
              <Label>Estoque (unidades)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.quantidadeEstoque}
                onChange={e => setCampo('quantidadeEstoque', e.target.value)}
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
