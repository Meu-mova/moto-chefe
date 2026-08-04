'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CATEGORIAS, RECORRENCIAS, VISIBILIDADES, CATEGORIA_META, RECORRENCIA_META, VISIBILIDADE_META } from '@/lib/calendario'
import { criarEventoAction, editarEventoAction, type EventoInput } from '../actions'
import type { OcorrenciaCalendario } from '@/lib/queries/calendario'

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  modo: 'criar' | 'editar'
  evento?: OcorrenciaCalendario
  dataInicial?: string
  lojas: { id: string; nome: string }[]
  usuariosGrupo: { id: string; nome: string }[]
  lojaIdUsuario: string | null
}

const selectCls = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white'

export function EventoDialog({ open, onOpenChange, modo, evento, dataInicial, lojas, usuariosGrupo, lojaIdUsuario }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [form, setForm] = useState(() => ({
    titulo:       evento?.titulo ?? '',
    descricao:    evento?.descricao ?? '',
    categoria:    evento?.categoria ?? 'evento',
    data:         evento?.dataAncora ?? dataInicial ?? '',
    hora:         evento?.hora ?? '',
    recorrencia:  evento?.recorrencia ?? 'nenhuma',
    visibilidade: evento?.visibilidade ?? 'grupo',
    lojaId:       evento?.lojaId ?? lojaIdUsuario ?? '',
  }))
  const [usuarioIds, setUsuarioIds] = useState<Set<string>>(new Set(evento?.participantesIds ?? []))

  function set<K extends keyof typeof form>(k: K, v: string) { setForm(f => ({ ...f, [k]: v })) }
  function toggleUsuario(id: string) {
    setUsuarioIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function salvar() {
    if (!form.titulo.trim()) { toast.error('Informe o título'); return }
    if (!form.data)          { toast.error('Escolha a data'); return }
    if (form.visibilidade === 'usuarios' && usuarioIds.size === 0) { toast.error('Escolha ao menos um usuário'); return }

    const input: EventoInput = {
      titulo:       form.titulo,
      descricao:    form.descricao || null,
      categoria:    form.categoria,
      data:         form.data,
      hora:         form.hora || null,
      recorrencia:  form.recorrencia,
      visibilidade: form.visibilidade,
      lojaId:       form.visibilidade === 'loja' ? (form.lojaId || null) : null,
      usuarioIds:   form.visibilidade === 'usuarios' ? [...usuarioIds] : [],
    }

    start(async () => {
      try {
        if (modo === 'editar' && evento) await editarEventoAction(evento.id, input)
        else await criarEventoAction(input)
        toast.success(modo === 'editar' ? 'Evento atualizado' : 'Evento criado')
        onOpenChange(false)
        router.refresh()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modo === 'editar' ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Título <span className="text-red-500">*</span></Label>
            <Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Vencimento aluguel, Aniversário do João" />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={selectCls}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_META[c].label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.data} onChange={e => set('data', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horário <span className="text-slate-400 text-xs">(opcional)</span></Label>
              <Input type="time" value={form.hora} onChange={e => set('hora', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repetição</Label>
            <select value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)} className={selectCls}>
              {RECORRENCIAS.map(r => <option key={r} value={r}>{RECORRENCIA_META[r]}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Quem pode ver</Label>
            <select value={form.visibilidade} onChange={e => set('visibilidade', e.target.value)} className={selectCls}>
              {VISIBILIDADES.map(v => <option key={v} value={v}>{VISIBILIDADE_META[v].label}</option>)}
            </select>
            <p className="text-xs text-slate-400">{VISIBILIDADE_META[form.visibilidade as keyof typeof VISIBILIDADE_META].descricao}</p>
          </div>

          {form.visibilidade === 'loja' && (
            <div className="space-y-1.5">
              <Label>Loja</Label>
              <select value={form.lojaId} onChange={e => set('lojaId', e.target.value)} className={selectCls}>
                <option value="">Selecione...</option>
                {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          )}

          {form.visibilidade === 'usuarios' && (
            <div className="space-y-1.5">
              <Label>Usuários que veem</Label>
              <div className="border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y">
                {usuariosGrupo.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">Nenhum usuário no grupo.</p>}
                {usuariosGrupo.map(us => (
                  <label key={us.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={usuarioIds.has(us.id)} onChange={() => toggleUsuario(us.id)} />
                    {us.nome}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Descrição <span className="text-slate-400 text-xs">(opcional)</span></Label>
            <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} placeholder="Detalhes do evento..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? 'Salvando…' : modo === 'editar' ? 'Salvar' : 'Criar evento'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
