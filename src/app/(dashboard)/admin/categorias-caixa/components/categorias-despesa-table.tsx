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
import { Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  criarCategoriaDespesaAction,
  editarCategoriaDespesaAction,
  excluirCategoriaDespesaAction,
  toggleAtivoDespesaAction,
  contarLancamentosDaCategoriaAction,
} from '../actions'
import { MOTIVOS_CATEGORIA, rotuloMotivo } from '@/lib/categoria-despesa'
import { GRUPOS_DRE, rotuloGrupo } from '@/lib/dre'

type CategoriaDespesa = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
  contaComoDespesa: boolean
  motivoNaoOperacional: string | null
  grupoDre: string | null
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
  const [operacional, setOperacional] = useState(inicial?.contaComoDespesa ?? true)
  const [motivo, setMotivo] = useState(inicial?.motivoNaoOperacional ?? '')
  const [grupoDre, setGrupoDre] = useState(inicial?.grupoDre ?? '')
  const [lancamentos, setLancamentos] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const trocouTipo = inicial ? operacional !== inicial.contaComoDespesa : false

  // O número de lançamentos é buscado só quando o tipo muda, que é quando ele
  // importa: a classificação vale para o histórico inteiro, então essa é a conta
  // de quantos meses já fechados vão mudar de resultado.
  function aoTrocarTipo(novoValor: boolean) {
    setOperacional(novoValor)
    if (!novoValor && !motivo) setMotivo(MOTIVOS_CATEGORIA[0].valor)
    if (inicial && lancamentos === null) {
      contarLancamentosDaCategoriaAction(inicial.nome).then(setLancamentos).catch(() => {})
    }
  }

  function handleSalvar() {
    const dados = {
      nome,
      contaComoDespesa: operacional,
      motivoNaoOperacional: operacional ? null : motivo,
      grupoDre: operacional ? grupoDre : null,
    }
    startTransition(async () => {
      try {
        if (inicial) {
          await editarCategoriaDespesaAction(inicial.id, dados)
          toast.success('Categoria atualizada')
        } else {
          await criarCategoriaDespesaAction(dados)
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
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
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
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={operacional} onChange={() => aoTrocarTipo(true)} className="mt-1" />
                <span>
                  <span className="font-medium">Operacional</span>
                  <span className="block text-xs text-slate-500">
                    custo de tocar a loja — entra em Despesas Operacionais e reduz o lucro
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!operacional} onChange={() => aoTrocarTipo(false)} className="mt-1" />
                <span>
                  <span className="font-medium">Não operacional</span>
                  <span className="block text-xs text-slate-500">
                    saída real, mas não é custo de operar — fica fora do cálculo do lucro
                  </span>
                </span>
              </label>
            </div>
          </div>

          {!operacional && (
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              {/* select nativo: o que se grava é o slug e o que aparece é outro texto. */}
              <select
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                {MOTIVOS_CATEGORIA.map(m => (
                  <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                O card &quot;Retiradas de Sócios&quot; do Financeiro só mostra o que estiver
                como retirada de sócio.
              </p>
            </div>
          )}

          {operacional && (
            <div className="space-y-1.5">
              <Label>Grupo do DRE</Label>
              <select
                value={grupoDre}
                onChange={e => setGrupoDre(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="">— sem grupo (entra em Outras) —</option>
                {GRUPOS_DRE.map(g => (
                  <option key={g.valor} value={g.valor}>{g.rotulo}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Em que linha do DRE esta categoria entra. Sem grupo, ela cai em &quot;Outras&quot;
                — nada some do total.
              </p>
            </div>
          )}

          {trocouTipo && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                A classificação vale para o histórico inteiro, não só para os próximos
                lançamentos: o resultado dos meses já fechados muda.
                {lancamentos !== null && lancamentos > 0 && (
                  <> Há <strong>{lancamentos}</strong> lançamento(s) manual(is) nesta categoria
                  — o extrato do banco tem mais.</>
                )}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={pending || !nome.trim() || (!operacional && !motivo)}>
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

  const naoOperacionais = categorias.filter(c => !c.contaComoDespesa).length

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 max-w-2xl">
          <strong>Operacional</strong> é custo de tocar a loja e reduz o lucro.{' '}
          <strong>Não operacional</strong> é saída real que não é custo de operar — compra de
          mercadoria, retirada de sócio, transferência entre CNPJs, estorno ao cliente — e fica
          fora do cálculo. Hoje são {categorias.length - naoOperacionais} operacionais e{' '}
          {naoOperacionais} não operacionais. A classificação é aplicada na hora do relatório,
          então mudá-la altera também os meses já fechados.
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
              <TableHead>Grupo do DRE</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.map(cat => (
              <TableRow key={cat.id} className={!cat.ativo ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{cat.nome}</TableCell>
                <TableCell>
                  {/* Abre o mesmo diálogo do lápis: virar não operacional exige
                      escolher o motivo, então não dá pra alternar num clique. */}
                  <button onClick={() => setEditando(cat)} className="cursor-pointer text-left">
                    {cat.contaComoDespesa ? (
                      <Badge variant="outline">Operacional</Badge>
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 w-fit">
                          Não operacional
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          {rotuloMotivo(cat.motivoNaoOperacional)}
                        </span>
                      </span>
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <button onClick={() => setEditando(cat)} className="cursor-pointer text-left text-slate-600">
                    {cat.contaComoDespesa
                      ? (cat.grupoDre
                          ? rotuloGrupo(cat.grupoDre)
                          : <span className="text-amber-600">sem grupo</span>)
                      : <span className="text-slate-300">—</span>}
                  </button>
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
