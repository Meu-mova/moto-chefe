'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { criarModeloAction, editarModeloAction } from '../actions'

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  ativo: boolean
}

type Props = {
  modelo?: Modelo | null
  onClose: () => void
}

export function ModeloDialog({ modelo, onClose }: Props) {
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [valorMinimo, setValorMinimo] = useState(modelo?.valorMinimo ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !valorMinimo) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const payload = { nome, valorMinimo }
      if (modelo) {
        await editarModeloAction(modelo.id, payload)
        toast.success('Modelo atualizado')
      } else {
        await criarModeloAction(payload)
        toast.success('Modelo criado')
      }
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do Modelo *</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: JETMAX PRO"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Valor Mínimo de Venda (R$) *</Label>
            <CurrencyInput value={valorMinimo} onChange={setValorMinimo} placeholder="0,00" />
            <p className="text-xs text-slate-400">Preço base sobre o qual as taxas globais são aplicadas</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : modelo ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
