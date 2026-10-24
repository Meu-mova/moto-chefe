'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { CORES, CORES_KEYS, corMeta } from '@/lib/calendario'
import {
  criarCategoriaCalendarioAction,
  editarCategoriaCalendarioAction,
  excluirCategoriaCalendarioAction,
  toggleAtivoCategoriaCalendarioAction,
} from '../actions'

type Categoria = { id: string; nome: string; cor: string; ativo: boolean; ordem: number }

function CategoriaDialog({ open, onClose, inicial }: { open: boolean; onClose: () => void; inicial?: Categoria }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cor, setCor] = useState(inicial?.cor ?? 'blue')
  const [pending, start] = useTransition()

  function salvar() {
    start(async () => {
      try {
        if (inicial) { await editarCategoriaCalendarioAction(inicial.id, { nome, cor }); toast.success('Categoria atualizada') }
        else { await criarCategoriaCalendarioAction({ nome, cor }); toast.success('Categoria criada') }
        onClose()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Feira, Reunião, Folga" />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {CORES_KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCor(k)}
                  title={CORES[k].label}
                  className={`h-8 w-8 rounded-full ${CORES[k].swatch} flex items-center justify-center ring-offset-2 ring-offset-background ${cor === k ? 'ring-2 ring-ring' : ''}`}
                >
                  {cor === k && <Check size={15} className="text-primary-foreground" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending || !nome.trim()}>{pending ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CategoriasCalendarioTable({ categorias }: { categorias: Categoria[] }) {
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [criando, setCriando] = useState(false)
  const [pending, start] = useTransition()

  function toggle(cat: Categoria) {
    start(async () => {
      try {
        await toggleAtivoCategoriaCalendarioAction(cat.id, !cat.ativo)
        toast.success(cat.ativo ? 'Categoria desativada' : 'Categoria ativada')
      } catch { toast.error('Erro ao alterar status') }
    })
  }

  function excluir(cat: Categoria) {
    if (!confirm(`Excluir a categoria "${cat.nome}"?`)) return
    start(async () => {
      try { await excluirCategoriaCalendarioAction(cat.id); toast.success('Categoria excluída') }
      catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir') }
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCriando(true)} size="sm"><Plus size={16} className="mr-1.5" /> Nova categoria</Button>
      </div>
      <div className="bg-card rounded-lg border mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Cor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.map(cat => {
              const meta = corMeta(cat.cor)
              return (
                <TableRow key={cat.id} className={!cat.ativo ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{cat.nome}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{meta.label}</TableCell>
                  <TableCell>
                    <button onClick={() => toggle(cat)} disabled={pending} className="cursor-pointer">
                      <Badge variant={cat.ativo ? 'default' : 'secondary'}>{cat.ativo ? 'Ativa' : 'Inativa'}</Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(cat)}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => excluir(cat)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {categorias.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma categoria ainda.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {criando && <CategoriaDialog open onClose={() => setCriando(false)} />}
      {editando && <CategoriaDialog open onClose={() => setEditando(null)} inicial={editando} />}
    </>
  )
}
