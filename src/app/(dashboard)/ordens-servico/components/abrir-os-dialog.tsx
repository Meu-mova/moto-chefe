'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import { abrirOSAction } from '../actions'
import { ChassiLookup } from './chassi-lookup'
import type { VeiculoEncontrado } from '../buscar-veiculo-action'
import { toast } from 'sonner'

type Props = {
  mecanicos: { id: string; nome: string }[]
  lojas: { id: string; nome: string }[]
  papel: string
  lojaIdUsuario: string | null
}

type ClienteInfo = { id: string; nome: string; cpfCnpj: string | null; celular: string | null; email: string | null }

const FORM_VAZIO = {
  lojaId: '', mecanicoId: '', descricao: '', dataPrevisao: '',
  km: '', clienteNomeExterno: '', clienteFoneExterno: '',
}

export function AbrirOSDialog({ mecanicos, lojas, papel, lojaIdUsuario }: Props) {
  const isAdmin = ['admin_geral', 'admin_socio'].includes(papel)
  const [open, setOpen]  = useState(false)
  const [pending, start] = useTransition()

  const [form, setForm] = useState({ ...FORM_VAZIO, lojaId: lojaIdUsuario ?? '' })
  const [veiculo, setVeiculo] = useState<VeiculoEncontrado | null>(null)
  const [cliente, setCliente] = useState<ClienteInfo | null>(null)

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function resetar() {
    setVeiculo(null); setCliente(null)
    setForm({ ...FORM_VAZIO, lojaId: lojaIdUsuario ?? '' })
  }

  function salvar() {
    if (!veiculo?.chassi.trim()) {
      toast.error('Informe o chassi do veículo'); return
    }
    if (!form.descricao.trim()) {
      toast.error('Informe a descrição / reclamação'); return
    }

    start(async () => {
      try {
        await abrirOSAction({
          lojaId:             form.lojaId,
          chassiOs:           veiculo.chassi,
          motoId:             veiculo?.motoId || null,
          clienteId:          cliente?.id || null,
          mecanicoId:         form.mecanicoId || null,
          descricao:          form.descricao,
          dataPrevisao:       form.dataPrevisao || null,
          marcaExterna:       !veiculo?.motoId ? (veiculo?.marca || null) : null,
          modeloExterno:      !veiculo?.motoId ? (veiculo?.modelo || null) : null,
          km:                 form.km ? parseInt(form.km) : null,
          clienteNomeExterno: !cliente ? (form.clienteNomeExterno || null) : null,
          clienteFoneExterno: !cliente ? (form.clienteFoneExterno || null) : null,
        })
        toast.success('OS aberta com sucesso')
        setOpen(false)
        resetar()
      } catch (e: any) {
        toast.error(e.message ?? 'Erro ao abrir OS')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova OS
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!pending) { setOpen(o); if (!o) resetar() } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Serviço</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Loja (admin) */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Loja</Label>
                <select value={form.lojaId} onChange={e => set('lojaId', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Selecione...</option>
                  {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}

            {/* Busca chassi + CPF */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-1 bg-slate-50">
              <ChassiLookup
                onVeiculoEncontrado={setVeiculo}
                onClienteEncontrado={setCliente}
              />
            </div>

            {/* KM — sempre visível */}
            <div className="space-y-1.5">
              <Label>KM atual</Label>
              <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="Ex: 15000" />
            </div>

            {/* Cliente externo — só quando não encontrado/cadastrado */}
            {!cliente && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome do cliente</Label>
                  <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} placeholder="(35) 99999-9999" />
                </div>
              </div>
            )}

            {/* Mecânico */}
            <div className="space-y-1.5">
              <Label>Mecânico responsável</Label>
              <select value={form.mecanicoId} onChange={e => set('mecanicoId', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Sem mecânico definido</option>
                {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Previsão de entrega</Label>
              <Input type="datetime-local" value={form.dataPrevisao} onChange={e => set('dataPrevisao', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição / Reclamação do cliente <span className="text-red-500">*</span></Label>
              <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Descreva o que o cliente relatou..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetar() }} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? 'Salvando…' : 'Abrir OS'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
