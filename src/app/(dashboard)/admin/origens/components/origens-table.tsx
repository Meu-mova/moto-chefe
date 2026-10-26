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
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { TIPOS_ORIGEM } from '@/lib/origem-venda'
import { criarOrigemAction, editarOrigemAction, alternarOrigemAtivaAction } from '../actions'

type Origem = {
  id: string
  nome: string
  tipo: string
  pedeDetalhe: boolean
  ativo: boolean
  ordem: number
}

const TIPO_CLS: Record<string, string> = {
  Digital:    'bg-info/10 text-info border-info/30',
  Presencial: 'bg-warning/10 text-warning border-warning/30',
  Relacional: 'bg-success/10 text-success border-success/30',
  Parceria:   'bg-info/10 text-info border-info/30',
  Ativo:      'bg-info/10 text-info border-info/30',
  Outro:      'bg-muted text-muted-foreground border-border',
}

function OrigemDialog({
  open,
  onClose,
  inicial,
}: {
  open: boolean
  onClose: () => void
  inicial?: Origem
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'Digital')
  const [pedeDetalhe, setPedeDetalhe] = useState(inicial?.pedeDetalhe ?? false)
  const [ordem, setOrdem] = useState(String(inicial?.ordem ?? 0))
  const [pending, startTransition] = useTransition()

  function handleSalvar() {
    startTransition(async () => {
      try {
        const dados = { nome, tipo, pedeDetalhe, ordem: parseInt(ordem) || 0 }
        if (inicial) {
          await editarOrigemAction(inicial.id, dados)
          toast.success('Origem atualizada')
        } else {
          await criarOrigemAction(dados)
          toast.success('Origem criada')
        }
        onClose()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar origem' : 'Nova origem'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Instagram, Feira de Varginha…" />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TIPOS_ORIGEM.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              Agrupa a origem no relatório — é o que permite somar todo o Digital mesmo com
              campanhas cadastradas uma a uma.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={pedeDetalhe}
              onChange={e => setPedeDetalhe(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Exigir detalhe na venda
              <span className="block text-xs text-muted-foreground">
                Ligue em Indicação, Evento, Parceiro: o vendedor é obrigado a dizer quem/qual.
              </span>
            </span>
          </label>
          <div className="space-y-1">
            <Label>Ordem</Label>
            <Input value={ordem} onChange={e => setOrdem(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={pending || !nome.trim()}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OrigensTable({ origens }: { origens: Origem[] }) {
  const [novaOpen, setNovaOpen] = useState(false)
  const [editando, setEditando] = useState<Origem | null>(null)
  const [pending, startTransition] = useTransition()

  function alternar(o: Origem) {
    startTransition(async () => {
      try {
        await alternarOrigemAtivaAction(o.id, !o.ativo)
        toast.success(o.ativo ? 'Origem desativada' : 'Origem reativada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus size={14} /> Nova origem
        </Button>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origem</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead className="text-right">Ordem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {origens.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Nenhuma origem cadastrada neste grupo.
                </TableCell>
              </TableRow>
            )}
            {origens.map(o => (
              <TableRow key={o.id} className={o.ativo ? '' : 'opacity-60'}>
                <TableCell className="font-medium">{o.nome}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={TIPO_CLS[o.tipo] ?? TIPO_CLS.Outro}>{o.tipo}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {o.pedeDetalhe ? 'Obrigatório' : '—'}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{o.ordem}</TableCell>
                <TableCell>
                  {o.ativo
                    ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Ativa</Badge>
                    : <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Inativa</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditando(o)} title="Editar">
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => alternar(o)}>
                      {o.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {novaOpen && <OrigemDialog open onClose={() => setNovaOpen(false)} />}
      {editando && <OrigemDialog open inicial={editando} onClose={() => setEditando(null)} />}
    </div>
  )
}
