'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { corrigirPrecoCompraAction } from '../actions'

export function CorrigirPrecoCompraButton({ motoId, precoAtual }: { motoId: string; precoAtual: string | null }) {
  const [open, setOpen] = useState(false)
  const [preco, setPreco] = useState(precoAtual ?? '')
  const [loading, setLoading] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await corrigirPrecoCompraAction(motoId, preco)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success('Preço de compra corrigido')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-6 px-1" aria-label="Corrigir preço de compra"
        onClick={() => { setPreco(precoAtual ?? ''); setOpen(true) }}>
        <Pencil size={12} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir preço de compra</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Preço de compra (R$)</Label>
              <CurrencyInput value={preco} onChange={setPreco} placeholder="0,00" autoFocus />
            </div>
            <p className="text-xs text-muted-foreground">
              A correção fica registrada no log de ações, com o valor anterior e o novo.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
