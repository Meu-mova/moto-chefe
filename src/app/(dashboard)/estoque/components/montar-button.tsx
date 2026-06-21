'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Wrench } from 'lucide-react'
import { alterarStatusAction } from '../../estoque/[id]/actions'

type Mecanico = { id: string; nome: string }

type Props = {
  motoId: string
  descricao: string
  mecanicos: Mecanico[]
  showLabel?: boolean
}

export function MontarButton({ motoId, descricao, mecanicos, showLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [mecanicoId, setMecanicoId] = useState('')
  const [dataMontagem, setDataMontagem] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  function handleOpen() {
    setMecanicoId('')
    setDataMontagem(new Date().toISOString().split('T')[0])
    setObservacao('')
    setOpen(true)
  }

  async function handleConfirmar() {
    if (!mecanicoId || !dataMontagem) return
    setLoading(true)
    try {
      await alterarStatusAction(motoId, 'montada', observacao, mecanicoId, dataMontagem)
      toast.success('Moto montada com sucesso!')
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao montar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant={showLabel ? 'outline' : 'ghost'}
        size={showLabel ? 'sm' : 'icon'}
        title="Montar"
        onClick={handleOpen}
        className={showLabel
          ? 'h-8 gap-1.5 text-xs border-blue-300 text-blue-600 hover:bg-blue-50'
          : 'h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50'}
      >
        <Wrench size={showLabel ? 14 : 16} />
        {showLabel && 'Montar'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Montar Moto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{descricao}</p>
            <div className="space-y-2">
              <Label>Mecânico Responsável <span className="text-red-500">*</span></Label>
              <Select value={mecanicoId} onValueChange={v => setMecanicoId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar mecânico...">
                    {mecanicoId
                      ? (mecanicos.find(m => m.id === mecanicoId)?.nome ?? 'Mecânico selecionado')
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {mecanicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mecanicos.length === 0 && (
                <p className="text-xs text-red-500">Nenhum mecânico cadastrado.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Data da Montagem <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dataMontagem}
                onChange={e => setDataMontagem(e.target.value)}
              />
            </div>
            <Textarea
              placeholder="Observação (opcional)"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={loading || !mecanicoId || !dataMontagem}>
              {loading ? 'Montando...' : 'Confirmar Montagem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
