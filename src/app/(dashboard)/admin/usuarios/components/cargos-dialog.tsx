'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ITENS } from '@/lib/navegacao'
import { apagarCargoAction, criarCargoAction, editarCargoAction } from '../cargos-actions'
import { ModulosPicker } from './modulos-picker'

export type Cargo = { id: string; nome: string; modulos: string[]; contaId: string }

const rotulo = (id: string) => ITENS.find(i => i.id === id)?.label ?? id

// Lista e formulário no mesmo diálogo (variante B): `editando` null = lista; {} = cargo novo.
export function CargosDialog({ open, onOpenChange, cargos, podeDar }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cargos: Cargo[]
  podeDar: string[]
}) {
  const [editando, setEditando] = useState<Partial<Cargo> | null>(null)
  const [nome, setNome] = useState('')
  const [modulos, setModulos] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function abrir(c: Partial<Cargo>) {
    setEditando(c); setNome(c.nome ?? ''); setModulos(c.modulos ?? [])
  }

  function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do cargo'); return }
    startTransition(async () => {
      const dados = { nome, modulos }
      const r = editando?.id ? await editarCargoAction(editando.id, dados) : await criarCargoAction(dados)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(editando?.id ? 'Cargo atualizado' : 'Cargo criado')
      setEditando(null)
    })
  }

  function apagar(c: Cargo) {
    startTransition(async () => {
      const r = await apagarCargoAction(c.id)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success('Cargo apagado')
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setEditando(null) }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
          <DialogTitle>{editando ? (editando.id ? 'Editar cargo' : 'Novo cargo') : 'Cargos da Conta'}</DialogTitle>
          {!editando && <p className="text-sm text-muted-foreground">Cada cargo dá acesso só aos módulos marcados.</p>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {editando ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome do cargo</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Recepção" />
              </div>
              <div className="space-y-1.5">
                <Label>Módulos</Label>
                {podeDar.length === 0
                  ? <p className="text-sm text-muted-foreground">Nenhum módulo disponível para cargo ainda.</p>
                  : <ModulosPicker liberaveis={podeDar} papel="cargo" papeisExtras={[]} extras={modulos} bloqueados={[]}
                      onChange={v => setModulos(v.extras)} />}
              </div>
            </div>
          ) : cargos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cargo criado.</p>
          ) : (
            <ul className="divide-y">
              {cargos.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.modulos.length ? c.modulos.map(rotulo).join(', ') : 'Sem módulo'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.nome}`} onClick={() => abrir(c)} disabled={pending}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Apagar ${c.nome}`} onClick={() => apagar(c)} disabled={pending}><Trash2 size={14} /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-xl px-4 sm:px-6">
          {editando ? (
            <>
              <Button variant="outline" onClick={() => setEditando(null)} disabled={pending}>Voltar</Button>
              <Button onClick={salvar} disabled={pending}>{editando.id ? 'Salvar' : 'Criar cargo'}</Button>
            </>
          ) : (
            <Button onClick={() => abrir({})} className="gap-2"><Plus size={16} /> Novo cargo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
