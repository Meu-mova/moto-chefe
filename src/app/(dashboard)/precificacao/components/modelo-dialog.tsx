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
  custo: string | null
  ativo: boolean
}

type Props = {
  modelo?: Modelo | null
  onClose: () => void
}

export function ModeloDialog({ modelo, onClose }: Props) {
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [valorMinimo, setValorMinimo] = useState(modelo?.valorMinimo ?? '')
  const [custo, setCusto] = useState(modelo?.custo ?? '')
  const [loading, setLoading] = useState(false)

  const vMin = parseFloat(valorMinimo || '0')
  const vCusto = parseFloat(custo || '0')
  const margemR = vMin > 0 && vCusto > 0 ? vMin - vCusto : null
  const margemPct = vMin > 0 && margemR !== null ? (margemR / vMin) * 100 : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !valorMinimo) {
      toast.error('Preencha nome e valor mínimo')
      return
    }
    setLoading(true)
    try {
      const payload = { nome, valorMinimo, custo: custo || undefined }
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
            <Label>Custo (R$)</Label>
            <CurrencyInput value={custo} onChange={setCusto} placeholder="0,00" />
            <p className="text-xs text-slate-400">Valor que pagamos pela moto</p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor Mínimo de Venda — PIX (R$) *</Label>
            <CurrencyInput value={valorMinimo} onChange={setValorMinimo} placeholder="0,00" />
          </div>
          {margemR !== null && margemPct !== null && (
            <div className={`rounded-lg p-3 text-sm ${margemPct >= 20 ? 'bg-green-50 border border-green-200' : margemPct >= 10 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
              <span className="font-medium">Margem: </span>
              <span className={`font-bold ${margemPct >= 20 ? 'text-green-700' : margemPct >= 10 ? 'text-yellow-700' : 'text-red-700'}`}>
                {margemPct.toFixed(1)}%
              </span>
              <span className={`ml-2 ${margemPct >= 20 ? 'text-green-600' : margemPct >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                ({margemR.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              </span>
            </div>
          )}
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
