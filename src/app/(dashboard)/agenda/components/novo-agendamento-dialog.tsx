'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import { criarAgendamentoAction } from '../actions'
import { toast } from 'sonner'

const TIPOS_SERVICO = [
  'Revisão geral', 'Troca de óleo', 'Freios', 'Pneus', 'Elétrica',
  'Motor', 'Suspensão', 'Escapamento', 'Garantia / Pós-venda', 'Outros',
]

type Props = {
  lojas: { id: string; nome: string }[]
  mecanicos: { id: string; nome: string }[]
  papel: string
  lojaIdUsuario: string | null
  dataInicial?: string
}

export function NovoAgendamentoDialog({ lojas, mecanicos, papel, lojaIdUsuario, dataInicial }: Props) {
  const isAdmin   = ['admin_geral', 'admin_socio'].includes(papel)
  const [open, setOpen]   = useState(false)
  const [pending, start]  = useTransition()

  const hoje8h = dataInicial ?? (() => {
    const d = new Date(); d.setHours(8, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })()

  const [form, setForm] = useState({
    lojaId:           lojaIdUsuario ?? '',
    mecanicoId:       '',
    clienteNome:      '',
    clienteFone:      '',
    tipoServico:      '',
    descricaoCliente: '',
    dataHoraInicio:   hoje8h,
    duracaoMinutos:   '60',
  })

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function salvar() {
    if (!form.clienteNome.trim()) { toast.error('Informe o nome do cliente'); return }
    if (!form.clienteFone.trim()) { toast.error('Informe o telefone do cliente'); return }
    if (!form.tipoServico)        { toast.error('Selecione o tipo de serviço'); return }
    if (!form.dataHoraInicio)     { toast.error('Informe data e horário'); return }

    start(async () => {
      try {
        await criarAgendamentoAction({
          lojaId:           form.lojaId,
          mecanicoId:       form.mecanicoId || null,
          clienteNome:      form.clienteNome,
          clienteFone:      form.clienteFone,
          tipoServico:      form.tipoServico,
          descricaoCliente: form.descricaoCliente || null,
          dataHoraInicio:   form.dataHoraInicio,
          duracaoMinutos:   parseInt(form.duracaoMinutos),
        })
        toast.success('Agendamento criado')
        setOpen(false)
        setForm(f => ({ ...f, clienteNome: '', clienteFone: '', tipoServico: '', descricaoCliente: '', mecanicoId: '' }))
      } catch (e: any) { toast.error(e.message ?? 'Erro ao criar agendamento') }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Novo agendamento
      </Button>
      <Dialog open={open} onOpenChange={o => !pending && setOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome do cliente <span className="text-red-500">*</span></Label>
                <Input value={form.clienteNome} onChange={e => set('clienteNome', e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone <span className="text-red-500">*</span></Label>
                <Input value={form.clienteFone} onChange={e => set('clienteFone', e.target.value)} placeholder="(35) 99999-9999" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de serviço <span className="text-red-500">*</span></Label>
              <select value={form.tipoServico} onChange={e => set('tipoServico', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data e horário <span className="text-red-500">*</span></Label>
                <Input type="datetime-local" value={form.dataHoraInicio}
                  onChange={e => set('dataHoraInicio', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Duração estimada</Label>
                <select value={form.duracaoMinutos} onChange={e => set('duracaoMinutos', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="30">30 minutos</option>
                  <option value="60">1 hora</option>
                  <option value="90">1h30</option>
                  <option value="120">2 horas</option>
                  <option value="180">3 horas</option>
                  <option value="240">4+ horas (dia)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mecânico responsável</Label>
              <select value={form.mecanicoId} onChange={e => set('mecanicoId', e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Sem mecânico definido</option>
                {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações do cliente</Label>
              <Textarea value={form.descricaoCliente} onChange={e => set('descricaoCliente', e.target.value)}
                placeholder="O que o cliente relatou..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? 'Salvando…' : 'Agendar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
