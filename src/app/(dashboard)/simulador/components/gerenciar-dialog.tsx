'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { criarSimuladorAction, editarSimuladorAction } from '../actions'

type Modelo = {
  id: string
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}

type Props = {
  modelo?: Modelo | null
  onClose: () => void
}

function pct(v: string) {
  return (parseFloat(v) * 100).toFixed(4)
}

export function GerenciarDialog({ modelo, onClose }: Props) {
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [precoAvista, setPrecoAvista] = useState(modelo?.precoAvista ?? '')
  const [precoPix, setPrecoPix] = useState(modelo?.precoPix ?? '')
  const [taxaFisico, setTaxaFisico] = useState(modelo ? pct(modelo.taxaCartaoFisico) : '')
  const [taxaLink, setTaxaLink] = useState(modelo ? pct(modelo.taxaLinkPagamento) : '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome || !precoAvista || !precoPix || !taxaFisico || !taxaLink) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const payload = {
        nome,
        precoAvista,
        precoPix,
        taxaCartaoFisico: (parseFloat(taxaFisico) / 100).toFixed(6),
        taxaLinkPagamento: (parseFloat(taxaLink) / 100).toFixed(6),
      }
      if (modelo) {
        await editarSimuladorAction(modelo.id, payload)
        toast.success('Modelo atualizado')
      } else {
        await criarSimuladorAction(payload)
        toast.success('Modelo adicionado')
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Nome do Modelo *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: JETMAX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Preço À Vista (R$) *</Label>
              <CurrencyInput value={precoAvista} onChange={setPrecoAvista} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Preço PIX (R$) *</Label>
              <CurrencyInput value={precoPix} onChange={setPrecoPix} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Taxa Cartão Físico (%) *</Label>
              <Input
                type="number" step="0.0001" min="0" max="100"
                value={taxaFisico}
                onChange={e => setTaxaFisico(e.target.value)}
                placeholder="Ex: 8.77"
              />
              <p className="text-xs text-muted-foreground">Acréscimo sobre o preço à vista</p>
            </div>
            <div className="space-y-1">
              <Label>Taxa Link de Pagamento (%) *</Label>
              <Input
                type="number" step="0.0001" min="0" max="100"
                value={taxaLink}
                onChange={e => setTaxaLink(e.target.value)}
                placeholder="Ex: 14.74"
              />
              <p className="text-xs text-muted-foreground">Acréscimo sobre o preço à vista</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : modelo ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
