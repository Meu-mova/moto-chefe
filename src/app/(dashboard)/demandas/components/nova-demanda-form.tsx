'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { criarDemandaAction } from '../actions'

type Loja = { id: string; nome: string }
type Props = { lojas: Loja[]; lojaIdFixa: string | null }

export function NovaDemandaForm({ lojas, lojaIdFixa }: Props) {
  const [modelo, setModelo] = useState('')
  const [cor, setCor] = useState('')
  const [lojaId, setLojaId] = useState(lojaIdFixa ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelo.trim() || !cor.trim() || !lojaId) return
    setLoading(true)
    try {
      await criarDemandaAction(modelo, cor, lojaId)
      setModelo('')
      setCor('')
      if (!lojaIdFixa) setLojaId('')
      toast.success('Demanda registrada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar demanda')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 space-y-4">
      <h2 className="font-semibold text-sm">Nova demanda</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Input
            placeholder="Ex: Hunter 1500"
            value={modelo}
            onChange={e => setModelo(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cor</Label>
          <Input
            placeholder="Ex: Preto"
            value={cor}
            onChange={e => setCor(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Loja</Label>
          {lojaIdFixa ? (
            <Input value={lojas.find(l => l.id === lojaIdFixa)?.nome ?? ''} disabled />
          ) : (
            <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')} required>
              <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
              <SelectContent>
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <Button type="submit" disabled={loading || !modelo.trim() || !cor.trim() || !lojaId}>
        {loading ? 'Salvando…' : 'Registrar demanda'}
      </Button>
    </form>
  )
}
