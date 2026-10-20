'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Check, X } from 'lucide-react'
import { atualizarOSAction } from '../../actions'
import { toast } from 'sonner'

type Props = {
  osId: string
  descricao: string
  diagnostico: string
  observacoesFinais: string
  mecanicos: { id: string; nome: string }[]
  mecanicoId: string
  dataPrevisao: string
  km?: number
  clienteNomeExterno: string
  clienteFoneExterno: string
  temCliente: boolean
  podeEditar: boolean
}

export function OSEditarPanel(props: Props) {
  const [editing, setEditing] = useState(false)
  const [pending, start]      = useTransition()

  const [form, setForm] = useState({
    descricao:          props.descricao,
    diagnostico:        props.diagnostico,
    observacoesFinais:  props.observacoesFinais,
    mecanicoId:         props.mecanicoId,
    dataPrevisao:       props.dataPrevisao,
    km:                 props.km?.toString() ?? '',
    clienteNomeExterno: props.clienteNomeExterno,
    clienteFoneExterno: props.clienteFoneExterno,
  })

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function salvar() {
    start(async () => {
      try {
        await atualizarOSAction(props.osId, {
          mecanicoId:         form.mecanicoId || null,
          descricao:          form.descricao,
          diagnostico:        form.diagnostico,
          observacoesFinais:  form.observacoesFinais,
          dataPrevisao:       form.dataPrevisao || null,
          km:                 form.km ? parseInt(form.km) : null,
          clienteNomeExterno: form.clienteNomeExterno || null,
          clienteFoneExterno: form.clienteFoneExterno || null,
        })
        toast.success('OS atualizada')
        setEditing(false)
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function cancelar() {
    setForm({
      descricao:          props.descricao,
      diagnostico:        props.diagnostico,
      observacoesFinais:  props.observacoesFinais,
      mecanicoId:         props.mecanicoId,
      dataPrevisao:       props.dataPrevisao,
      km:                 props.km?.toString() ?? '',
      clienteNomeExterno: props.clienteNomeExterno,
      clienteFoneExterno: props.clienteFoneExterno,
    })
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Detalhes da OS</CardTitle>
        {props.podeEditar && !editing && (
          <button type="button" aria-label="Editar detalhes da OS" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground transition-colors">
            <Pencil size={14} />
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelar} disabled={pending} className="h-7 px-2 gap-1">
              <X size={13} /> Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={pending} className="h-7 px-2 gap-1">
              <Check size={13} /> {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mecânico e previsão */}
        {editing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mecânico</Label>
              <select value={form.mecanicoId} onChange={e => set('mecanicoId', e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                <option value="">Sem mecânico</option>
                {props.mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Previsão de entrega</Label>
              <Input type="datetime-local" value={form.dataPrevisao} onChange={e => set('dataPrevisao', e.target.value)} className="text-sm" />
            </div>
          </div>
        )}

        {/* KM — sempre visível */}
        {editing && (
          <div className="space-y-1.5">
            <Label className="text-xs">KM</Label>
            <Input type="number" value={form.km} onChange={e => set('km', e.target.value)} className="text-sm" />
          </div>
        )}

        {/* Cliente externo — só quando não há cliente cadastrado vinculado */}
        {editing && !props.temCliente && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={form.clienteNomeExterno} onChange={e => set('clienteNomeExterno', e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={form.clienteFoneExterno} onChange={e => set('clienteFoneExterno', e.target.value)} className="text-sm" />
            </div>
          </div>
        )}

        {/* Descrição */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Reclamação / Descrição</Label>
          {editing
            ? <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={3} />
            : <p className="text-sm text-foreground whitespace-pre-wrap bg-muted rounded-md px-3 py-2">{props.descricao || '—'}</p>
          }
        </div>

        {/* Diagnóstico */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Diagnóstico técnico</Label>
          {editing
            ? <Textarea value={form.diagnostico} onChange={e => set('diagnostico', e.target.value)} rows={3} placeholder="Laudo do mecânico..." />
            : <p className="text-sm text-foreground whitespace-pre-wrap bg-muted rounded-md px-3 py-2">{props.diagnostico || <span className="text-muted-foreground">Não preenchido</span>}</p>
          }
        </div>

        {/* Observações finais */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Observações finais</Label>
          {editing
            ? <Textarea value={form.observacoesFinais} onChange={e => set('observacoesFinais', e.target.value)} rows={2} placeholder="Recomendações, próxima revisão..." />
            : <p className="text-sm text-foreground whitespace-pre-wrap bg-muted rounded-md px-3 py-2">{props.observacoesFinais || <span className="text-muted-foreground">Não preenchido</span>}</p>
          }
        </div>
      </CardContent>
    </Card>
  )
}
