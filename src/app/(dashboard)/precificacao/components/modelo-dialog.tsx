'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { salvarPrecoAction } from '../actions'

type Modelo = {
  precId: string | null
  doCatalogo: boolean
  nome: string
  marca: string | null
  valorMinimo: string | null
  custo: string | null
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

  // Modelo do catálogo tem o nome travado: é ele que liga o preço ao cadastro
  // de /admin/modelos (e às vendas, que casam por nome). Renomear aqui soltaria
  // o preço do modelo sem ninguém perceber. Para renomear, edite em Modelos.
  const nomeTravado = modelo?.doCatalogo ?? false
  const primeiroPreco = !!modelo && modelo.precId === null

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
      await salvarPrecoAction({
        precId: modelo?.precId ?? null,
        nome,
        valorMinimo,
        custo: custo || undefined,
      })
      toast.success(primeiroPreco || !modelo ? 'Preço definido' : 'Modelo atualizado')
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  const titulo = !modelo ? 'Novo Modelo' : primeiroPreco ? 'Definir preço' : 'Editar Modelo'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do Modelo *</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: JETMAX PRO"
              autoFocus={!nomeTravado}
              disabled={nomeTravado}
            />
            {nomeTravado && (
              <p className="text-xs text-muted-foreground">
                {modelo?.marca ? `${modelo.marca} · ` : ''}Cadastrado em Modelos — para renomear, edite lá.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Custo (R$)</Label>
            <CurrencyInput value={custo} onChange={setCusto} placeholder="0,00" />
            <p className="text-xs text-muted-foreground">Valor que pagamos pela moto</p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor Mínimo de Venda — PIX (R$) *</Label>
            <CurrencyInput value={valorMinimo} onChange={setValorMinimo} placeholder="0,00" autoFocus={nomeTravado} />
          </div>
          {margemR !== null && margemPct !== null && (
            <div className={`rounded-lg p-3 text-sm ${margemPct >= 20 ? 'bg-success/10 border border-success/30' : margemPct >= 10 ? 'bg-warning/10 border border-warning/30' : 'bg-destructive/10 border border-destructive/30'}`}>
              <span className="font-medium">Margem: </span>
              <span className={`font-bold ${margemPct >= 20 ? 'text-success' : margemPct >= 10 ? 'text-warning' : 'text-destructive'}`}>
                {margemPct.toFixed(1)}%
              </span>
              <span className={`ml-2 ${margemPct >= 20 ? 'text-success' : margemPct >= 10 ? 'text-warning' : 'text-destructive'}`}>
                ({margemR.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              </span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : primeiroPreco || !modelo ? 'Definir preço' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
