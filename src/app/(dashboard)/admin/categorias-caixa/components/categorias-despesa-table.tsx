'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  criarCategoriaDespesaAction,
  editarCategoriaDespesaAction,
  excluirCategoriaDespesaAction,
  toggleAtivoDespesaAction,
} from '../actions'

type CategoriaDespesa = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
}

function CategoriaDespesaDialog({
  open,
  onClose,
  inicial,
}: {
  open: boolean
  onClose: () => void
  inicial?: CategoriaDespesa
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [pending, startTransition] = useTransition()

  function handleSalvar() {
    startTransition(async () => {
      try {
        if (inicial) {
          await editarCategoriaDespesaAction(inicial.id, { nome })
          toast.success('Categoria atualizada')
        } else {
          await criarCategoriaDespesaAction({ nome })
          toast.success('Categoria criada')
        }
        onClose()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Aluguel" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={pending || !nome.trim()}>
            {pending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmarExclusaoDespesaDialog({
  categoria,
  onClose,
}: {
  categoria: CategoriaDespesa | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()

  function handleExcluir() {
    if (!categoria) return
    startTransition(async () => {
      try {
        await excluirCategoriaDespesaAction(categoria.id)
        toast.success('Categoria excluída')
        onClose()
      } catch {
        toast.error('Erro ao excluir')
      }
    })
  }

  return (
    <Dialog open={!!categoria} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Excluir categoria?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          A categoria <strong>{categoria?.nome}</strong> será removida permanentemente.
          Despesas já lançadas não serão afetadas.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleExcluir}
            disabled={pending}
          >
            {pending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CategoriasDespesaTable({ categorias }: { categorias: CategoriaDespesa[] }) {
  const [editando, setEditando] = useState<CategoriaDespesa | null>(null)
  const [criando, setCriando] = useState(false)
  const [excluindo, setExcluindo] = useState<CategoriaDespesa | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(cat: CategoriaDespesa) {
    startTransition(async () => {
      try {
        await toggleAtivoDespesaAction(cat.id, !cat.ativo)
        toast.success(cat.ativo ? 'Categoria desativada' : 'Categoria ativada')
      } catch {
        toast.error('Erro ao alterar status')
      }
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCriando(true)} size="sm">
          <Plus size={16} className="mr-1.5" /> Nova Categoria
        </Button>
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.map(cat => (
              <TableRow key={cat.id} className={!cat.ativo ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{cat.nome}</TableCell>
                <TableCell>
                  <button
                    onClick={() => handleToggle(cat)}
                    disabled={pending}
                    className="cursor-pointer"
                  >
                    <Badge variant={cat.ativo ? 'default' : 'secondary'}>
                      {cat.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditando(cat)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setExcluindo(cat)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {criando && (
        <CategoriaDespesaDialog open onClose={() => setCriando(false)} />
      )}
      {editando && (
        <CategoriaDespesaDialog open onClose={() => setEditando(null)} inicial={editando} />
      )}
      <ConfirmarExclusaoDespesaDialog
        categoria={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </>
  )
}
