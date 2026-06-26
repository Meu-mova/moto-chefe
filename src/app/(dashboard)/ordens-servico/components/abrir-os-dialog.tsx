'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { abrirOSAction } from '../actions'
import { ClienteBusca } from '@/app/(dashboard)/clientes/components/cliente-busca'

type Moto = { id: string; chassi: string; marca: string; modelo: string }
type Mecanico = { id: string; nome: string }
type Props = { motos: Moto[]; mecanicos: Mecanico[]; papel: string }

export function AbrirOSDialog({ motos, mecanicos, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [mecanicoId, setMecanicoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(false)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<{ id: string; nome: string } | null>(null)

  function handleClienteSelect(id: string, nome: string, _cpfCnpj: string | null) {
    setClienteId(id)
    setClienteSelecionado({ id, nome })
  }

  function handleClienteClear() {
    setClienteId(null)
    setClienteSelecionado(null)
  }

  function resetForm() {
    setMotoId('')
    setMecanicoId('')
    setDescricao('')
    setClienteId(null)
    setClienteSelecionado(null)
  }

  async function handleAbrir() {
    if (!motoId || !descricao) return
    setLoading(true)
    try {
      await abrirOSAction(motoId, mecanicoId || null, descricao, clienteId)
      setOpen(false)
      resetForm()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir OS')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(value: boolean) {
    setOpen(value)
    if (!value) resetForm()
  }

  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir OS</Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={v => setMotoId(v ?? '')}>
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
              <Label>Mecânico Responsável (opcional)</Label>
              <Select value={mecanicoId} onValueChange={v => setMecanicoId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Selecionar mecânico" /></SelectTrigger>
                <SelectContent>
                  {mecanicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <ClienteBusca
                label="Cliente (opcional)"
                clienteSelecionado={clienteSelecionado}
                onSelect={handleClienteSelect}
                onClear={handleClienteClear}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o problema ou serviço..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleAbrir} disabled={loading || !motoId || !descricao}>
              {loading ? 'Abrindo...' : 'Abrir OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
