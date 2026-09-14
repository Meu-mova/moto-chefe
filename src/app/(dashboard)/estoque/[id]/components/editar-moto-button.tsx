'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Pencil } from 'lucide-react'
import { editarMotoAction } from '../actions'
import { CORES_MOTO } from '@/lib/cores-moto'

type Loja = { id: string; nome: string }
type Modelo = { id: string; modelo: string }

type MotoData = {
  id: string
  chassi: string
  cor: string
  motor: string
  modeloId: string
  lojaId: string
  notaFiscalEntrada: string
  status: string
  disponibilidade: string | null
}

type Props = {
  moto: MotoData
  lojas: Loja[]
  modelos: Modelo[]
}

const statusOpts = [
  { value: 'caixa', label: 'Caixa' },
  { value: 'montada', label: 'Montada' },
  { value: 'em_garantia', label: 'Garantia' },
]

const dispOpts = [
  { value: '__null__', label: 'Nenhuma' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservada', label: 'Reservada' },
  { value: 'vendida', label: 'Vendida' },
]

export function EditarMotoButton({ moto, lojas, modelos }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [chassi, setChassi] = useState(moto.chassi)
  const [cor, setCor] = useState(moto.cor)
  const [motor, setMotor] = useState(moto.motor)
  const [modeloId, setModeloId] = useState(moto.modeloId)
  const [lojaId, setLojaId] = useState(moto.lojaId)
  const [nfEntrada, setNfEntrada] = useState(moto.notaFiscalEntrada)
  const [status, setStatus] = useState(moto.status)
  const [disponibilidade, setDisponibilidade] = useState(moto.disponibilidade ?? '__null__')

  function handleOpen() {
    setChassi(moto.chassi)
    setCor(moto.cor)
    setMotor(moto.motor)
    setModeloId(moto.modeloId)
    setLojaId(moto.lojaId)
    setNfEntrada(moto.notaFiscalEntrada)
    setStatus(moto.status)
    setDisponibilidade(moto.disponibilidade ?? '__null__')
    setOpen(true)
  }

  async function handleSalvar() {
    if (!chassi.trim() || !cor.trim() || !nfEntrada.trim()) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setLoading(true)
    try {
      await editarMotoAction(moto.id, {
        chassi: chassi.trim(),
        cor: cor.trim().toUpperCase(),
        motor: motor.trim(),
        modeloId,
        lojaId,
        notaFiscalEntrada: nfEntrada.trim(),
        status,
        disponibilidade: disponibilidade === '__null__' ? null : disponibilidade,
      })
      toast.success('Moto atualizada!')
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="h-8 gap-1.5 text-xs"
      >
        <Pencil size={14} />
        Editar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Moto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chassi <span className="text-red-500">*</span></Label>
                <Input value={chassi} onChange={e => setChassi(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label>Cor <span className="text-red-500">*</span></Label>
                {/* Lista fechada: cor digitada à mão é o que cria "PRETA" ao
                    lado de "PRETO" e quebra a contagem por cor do /compras.
                    <select> nativo porque value e rótulo são o mesmo texto. */}
                <select
                  value={cor}
                  onChange={e => setCor(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none"
                >
                  {!CORES_MOTO.includes(cor as (typeof CORES_MOTO)[number]) && (
                    <option value={cor}>{cor} (fora da lista)</option>
                  )}
                  {CORES_MOTO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Motor</Label>
              <Input value={motor} onChange={e => setMotor(e.target.value)} className="font-mono text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={modeloId} onValueChange={v => v && setModeloId(v)}>
                  <SelectTrigger>
                    {modelos.find(m => m.id === modeloId)?.modelo ?? 'Selecionar'}
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.modelo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select value={lojaId} onValueChange={v => v && setLojaId(v)}>
                  <SelectTrigger>
                    {lojas.find(l => l.id === lojaId)?.nome ?? 'Selecionar'}
                  </SelectTrigger>
                  <SelectContent>
                    {lojas.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>NF Entrada <span className="text-red-500">*</span></Label>
              <Input value={nfEntrada} onChange={e => setNfEntrada(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={v => v && setStatus(v)}>
                  <SelectTrigger>
                    {statusOpts.find(s => s.value === status)?.label ?? status}
                  </SelectTrigger>
                  <SelectContent>
                    {statusOpts.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Disponibilidade</Label>
                <Select value={disponibilidade} onValueChange={v => v && setDisponibilidade(v)}>
                  <SelectTrigger>
                    {dispOpts.find(d => d.value === disponibilidade)?.label ?? disponibilidade}
                  </SelectTrigger>
                  <SelectContent>
                    {dispOpts.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading || !chassi.trim() || !cor.trim() || !nfEntrada.trim()}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
