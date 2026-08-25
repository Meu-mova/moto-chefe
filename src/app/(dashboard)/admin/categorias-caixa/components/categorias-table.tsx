'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  criarCategoriaAction,
  editarCategoriaAction,
  excluirCategoriaAction,
  toggleAtivoAction,
  toggleContaComoDespesaCaixaAction,
} from '../actions'

type Categoria = {
  id: string
  nome: string
  tipo: string
  ativo: boolean
  ordem: number
  contaComoDespesa: boolean
}

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  saida:   'Saída',
  ambos:   'Ambos',
}

const TIPO_CLS: Record<string, string> = {
  entrada: 'bg-green-50 text-green-700 border-green-200',
  saida:   'bg-red-50 text-red-700 border-red-200',
  ambos:   'bg-blue-50 text-blue-700 border-blue-200',
}

function CategoriaDialog({
  open,
  onClose,
  inicial,
}: {
  open: boolean
  onClose: () => void
  inicial?: Categoria
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'saida')
  const [pending, startTransition] = useTransition()

  function handleSalvar() {
    startTransition(async () => {
      try {
        if (inicial) {
          await editarCategoriaAction(inicial.id, { nome, tipo })
          toast.success('Categoria atualizada')
        } else {
          await criarCategoriaAction({ nome, tipo })
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
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
              <option value="ambos">Ambos</option>
            </select>
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

function ConfirmarExclusaoDialog({
  categoria,
  onClose,
}: {
  categoria: Categoria | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()

  function handleExcluir() {
    if (!categoria) return
    startTransition(async () => {
      try {
        await excluirCategoriaAction(categoria.id)
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
          Lançamentos existentes não serão afetados.
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

export function CategoriasTable({ categorias }: { categorias: Categoria[] }) {
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [criando, setCriando] = useState(false)
  const [excluindo, setExcluindo] = useState<Categoria | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(cat: Categoria) {
    startTransition(async () => {
      try {
        await toggleAtivoAction(cat.id, !cat.ativo)
        toast.success(cat.ativo ? 'Categoria desativada' : 'Categoria ativada')
      } catch {
        toast.error('Erro ao alterar status')
      }
    })
  }

  // Sem motivo a escolher: a saída de caixa que não é gasto tem um motivo só
  // ('caixa_nao_despesa'), então aqui alterna direto no clique.
  function handleToggleDespesa(cat: Categoria) {
    startTransition(async () => {
      try {
        await toggleContaComoDespesaCaixaAction(cat.id, !cat.contaComoDespesa)
        toast.success(cat.contaComoDespesa
          ? 'Fora das despesas operacionais'
          : 'Conta como despesa operacional')
      } catch {
        toast.error('Erro ao alterar')
      }
    })
  }

  const saidas   = categorias.filter(c => c.tipo === 'saida')
  const entradas = categorias.filter(c => c.tipo === 'entrada')
  const ambos    = categorias.filter(c => c.tipo === 'ambos')

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 max-w-2xl">
          Categoria de saída marcada como <strong>não operacional</strong> fica fora do cálculo do
          lucro no Financeiro: &quot;Depósito&quot; é dinheiro indo da gaveta pro banco, não gasto.
          A regra vale para o histórico inteiro, então muda também os meses já fechados.
        </p>
        <Button onClick={() => setCriando(true)} size="sm" className="shrink-0">
          <Plus size={16} className="mr-1.5" /> Nova Categoria
        </Button>
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Despesa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...saidas, ...entradas, ...ambos].map(cat => (
              <TableRow key={cat.id} className={!cat.ativo ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{cat.nome}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TIPO_CLS[cat.tipo] ?? ''}`}>
                    {TIPO_LABEL[cat.tipo] ?? cat.tipo}
                  </span>
                </TableCell>
                <TableCell>
                  {cat.tipo === 'entrada' ? (
                    <span className="text-xs text-slate-300">--</span>
                  ) : (
                    <button
                      onClick={() => handleToggleDespesa(cat)}
                      disabled={pending}
                      className="cursor-pointer"
                    >
                      {cat.contaComoDespesa ? (
                        <Badge variant="outline">Operacional</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Não operacional
                        </Badge>
                      )}
                    </button>
                  )}
                </TableCell>
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
        <CategoriaDialog open onClose={() => setCriando(false)} />
      )}
      {editando && (
        <CategoriaDialog open onClose={() => setEditando(null)} inicial={editando} />
      )}
      <ConfirmarExclusaoDialog
        categoria={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </>
  )
}
