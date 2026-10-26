'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileText } from 'lucide-react'
import { ChassiLookup } from '@/app/(dashboard)/ordens-servico/components/chassi-lookup'
import type { VeiculoEncontrado } from '@/app/(dashboard)/ordens-servico/buscar-veiculo-action'
import { agendamentoVirarOSAction } from '../actions'
import { toast } from 'sonner'

type ClienteInfo = { id: string; nome: string; cpfCnpj: string | null; celular: string | null; email: string | null }

type Props = {
  agendamentoId: string
  clienteNome: string
  clienteFone: string
  mecanicoId: string | null
  descricao: string
  mecanicos: { id: string; nome: string }[]
  disabled?: boolean
}

export function VirarOSDialog({
  agendamentoId, clienteNome, clienteFone, mecanicoId, descricao, mecanicos, disabled,
}: Props) {
  const [open, setOpen]  = useState(false)
  const [pending, start] = useTransition()

  // O agendamento só tem nome e telefone; o resto o adm completa aqui.
  const formInicial = {
    mecanicoId:         mecanicoId ?? '',
    descricao,
    dataPrevisao:       '',
    km:                 '',
    clienteNomeExterno: clienteNome,
    clienteFoneExterno: clienteFone,
    clienteTipoPessoaExterno: 'fisica',
    clienteDocumentoExterno:  '',
  }

  const [form, setForm]       = useState(formInicial)
  const [veiculo, setVeiculo] = useState<VeiculoEncontrado | null>(null)
  const [cliente, setCliente] = useState<ClienteInfo | null>(null)

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function resetar() {
    setVeiculo(null); setCliente(null); setForm(formInicial)
  }

  const ehEmpresa  = !cliente && form.clienteTipoPessoaExterno === 'juridica'
  const digitosDoc = form.clienteDocumentoExterno.replace(/\D/g, '')

  function salvar() {
    if (!veiculo?.chassi.trim()) {
      toast.error('Informe o chassi do veículo'); return
    }
    if (!form.descricao.trim()) {
      toast.error('Informe a descrição / reclamação'); return
    }
    // Espelha a trava do servidor pra dar o erro antes de abrir a OS torta.
    if (ehEmpresa && (digitosDoc.length !== 14 || !form.clienteNomeExterno.trim())) {
      toast.error('OS para empresa exige razão social e CNPJ com 14 dígitos'); return
    }

    start(async () => {
      try {
        const os = await agendamentoVirarOSAction(agendamentoId, {
          chassiOs:      veiculo.chassi,
          motoId:        veiculo.motoId || null,
          clienteId:     cliente?.id || null,
          mecanicoId:    form.mecanicoId || null,
          descricao:     form.descricao,
          dataPrevisao:  form.dataPrevisao || null,
          marcaExterna:  !veiculo.motoId ? (veiculo.marca  || null) : null,
          modeloExterno: !veiculo.motoId ? (veiculo.modelo || null) : null,
          km:            form.km ? parseInt(form.km) : null,
          clienteNomeExterno: !cliente ? (form.clienteNomeExterno || null) : null,
          clienteFoneExterno: !cliente ? (form.clienteFoneExterno || null) : null,
          clienteTipoPessoaExterno: !cliente ? form.clienteTipoPessoaExterno : null,
          clienteDocumentoExterno:  !cliente ? (digitosDoc || null) : null,
        })
        toast.success(`OS #${os.numero} criada`)
        setOpen(false)
        resetar()
      } catch (e: any) { toast.error(e.message ?? 'Erro ao virar OS') }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={disabled}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
        <FileText size={11} /> Virar OS
      </button>

      <Dialog open={open} onOpenChange={o => { if (!pending) { setOpen(o); if (!o) resetar() } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Virar agendamento em OS</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Busca chassi + CPF */}
            <div className="border border-border rounded-xl p-4 space-y-1 bg-muted">
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

            {/* Cliente externo — só quando não há cliente do cadastro selecionado */}
            {!cliente && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de cliente</Label>
                  <select
                    value={form.clienteTipoPessoaExterno}
                    onChange={e => set('clienteTipoPessoaExterno', e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-card"
                  >
                    <option value="fisica">Pessoa física</option>
                    <option value="juridica">Empresa (CNPJ)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{ehEmpresa ? 'CNPJ' : 'CPF (opcional)'}</Label>
                  <Input
                    value={form.clienteDocumentoExterno}
                    onChange={e => set('clienteDocumentoExterno', e.target.value)}
                    placeholder={ehEmpresa ? '00.000.000/0000-00' : '000.000.000-00'}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{ehEmpresa ? 'Razão social' : 'Nome do cliente'}</Label>
                  <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)}
                    placeholder={ehEmpresa ? 'Razão social da empresa' : 'Nome completo'} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)}
                    placeholder="(35) 99999-9999" />
                </div>
              </div>
            )}

            {/* Mecânico */}
            <div className="space-y-1.5">
              <Label>Mecânico responsável</Label>
              <select value={form.mecanicoId} onChange={e => set('mecanicoId', e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-card">
                <option value="">Sem mecânico definido</option>
                {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Previsão de entrega</Label>
              <Input type="datetime-local" value={form.dataPrevisao} onChange={e => set('dataPrevisao', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição / Reclamação do cliente <span className="text-destructive">*</span></Label>
              <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Descreva o que o cliente relatou..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetar() }} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? 'Abrindo…' : 'Abrir OS'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
