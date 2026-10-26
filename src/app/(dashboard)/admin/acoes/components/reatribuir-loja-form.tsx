'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { reatribuirLojaMotaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string; lojaId: string }
type Loja = { id: string; nome: string }

export function ReatribuirLojaForm({ motos, lojas }: { motos: Moto[]; lojas: Loja[] }) {
  const [motoId, setMotoId] = useState('')
  const [novaLojaId, setNovaLojaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const motoSelecionada = motos.find(m => m.id === motoId)
  const lojasDestino = lojas.filter(l => l.id !== motoSelecionada?.lojaId)

  async function handleReatribuir() {
    if (!motoId || !novaLojaId || !observacao) return
    setLoading(true)
    try {
      await reatribuirLojaMotaAction(motoId, novaLojaId, observacao)
      setMotoId(''); setNovaLojaId(''); setObservacao('')
      toast.success('Loja reatribuída com sucesso.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reatribuir Loja de Moto Faturada</CardTitle>
        <p className="text-sm text-muted-foreground">Corrige o loja_id de motos cadastradas na loja errada. Apenas motos com status "Faturada".</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Moto Faturada</Label>
          <Select value={motoId} onValueChange={v => { setMotoId(v ?? ''); setNovaLojaId('') }}>
            <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
            <SelectContent>
              {motos.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.marca} {m.modelo} — {m.chassi}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nova Loja</Label>
          <Select value={novaLojaId} onValueChange={v => setNovaLojaId(v ?? '')} disabled={!motoId}>
            <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
            <SelectContent>
              {lojasDestino.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Motivo da Correção (obrigatório)</Label>
          <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: Moto cadastrada na loja errada durante a entrada do lote..." />
        </div>
        <Button onClick={handleReatribuir} disabled={loading || !motoId || !novaLojaId || !observacao}>
          {loading ? 'Reatribuindo...' : 'Reatribuir Loja'}
        </Button>
      </CardContent>
    </Card>
  )
}
