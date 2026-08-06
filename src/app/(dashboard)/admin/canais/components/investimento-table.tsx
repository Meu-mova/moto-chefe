'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { salvarInvestimentoAction, excluirInvestimentoAction } from '../actions'

type Investimento = {
  id: string
  mes: string           // "YYYY-MM-DD"
  pipelineId: string | null
  plataforma: string
  valor: number
  observacao: string | null
}
type Funil = { pipelineId: string; funil: string }

const PLATAFORMAS = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Impulsionamento', 'Outro']

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const rotuloMes = (mes: string) => {
  const [ano, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1] ?? m}/${ano}`
}

function InvestimentoDialog({ inicial, funis, onClose }: {
  inicial?: Investimento; funis: Funil[]; onClose: () => void
}) {
  const agora = new Date()
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(inicial ? inicial.mes.slice(0, 7) : mesAtual)
  const [pipelineId, setPipelineId] = useState(inicial?.pipelineId ?? '')
  const [plataforma, setPlataforma] = useState(inicial?.plataforma ?? PLATAFORMAS[0])
  const [valor, setValor] = useState(inicial ? String(inicial.valor) : '')
  const [observacao, setObservacao] = useState(inicial?.observacao ?? '')
  const [pending, startTransition] = useTransition()

  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.'))
  const valido = /^\d{4}-\d{2}$/.test(mes) && plataforma.trim() && Number.isFinite(valorNum) && valorNum >= 0

  function salvar() {
    startTransition(async () => {
      try {
        await salvarInvestimentoAction({
          id: inicial?.id,
          mes,
          pipelineId: pipelineId || null,
          plataforma: plataforma.trim(),
          valor: valorNum,
          observacao,
        })
        toast.success('Investimento salvo')
        onClose()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <Dialog open onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader><DialogTitle>{inicial ? 'Editar investimento' : 'Lançar investimento'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex: 3500" inputMode="decimal" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <select className="h-9 w-full rounded-md border px-2 text-sm bg-white"
                    value={PLATAFORMAS.includes(plataforma) ? plataforma : 'Outro'}
                    onChange={e => setPlataforma(e.target.value === 'Outro' ? '' : e.target.value)}>
              {PLATAFORMAS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {!PLATAFORMAS.slice(0, -1).includes(plataforma) && (
              <Input value={plataforma} onChange={e => setPlataforma(e.target.value)} placeholder="Nome da plataforma" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Loja / funil</Label>
            <select className="h-9 w-full rounded-md border px-2 text-sm bg-white"
                    value={pipelineId} onChange={e => setPipelineId(e.target.value)}>
              <option value="">Grupo inteiro (sem loja definida)</option>
              {funis.map(f => <option key={f.pipelineId} value={f.pipelineId}>{f.funil}</option>)}
            </select>
            <p className="text-xs text-slate-400">
              Verba lançada na loja permite calcular CPL e ROAS daquela loja. Sem loja, entra só no total do grupo.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending || !valido}>{pending ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InvestimentoTable({ investimentos, funis, grupoNome }: {
  investimentos: Investimento[]; funis: Funil[]; grupoNome: string
}) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Investimento | null>(null)
  const [excluindo, setExcluindo] = useState<Investimento | null>(null)
  const [pending, startTransition] = useTransition()
  const nomeFunil = new Map(funis.map(f => [f.pipelineId, f.funil]))

  function excluir() {
    if (!excluindo) return
    startTransition(async () => {
      try {
        await excluirInvestimentoAction(excluindo.id)
        toast.success('Lançamento excluído')
        setExcluindo(null)
      } catch {
        toast.error('Erro ao excluir')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 max-w-2xl">
          Verba de mídia do grupo <strong>{grupoNome}</strong>, por mês. É o que permite calcular custo por lead,
          custo por venda e retorno. Mês parcial no filtro do relatório é rateado por dia.
        </p>
        <Button size="sm" onClick={() => setCriando(true)}><Plus size={16} className="mr-1.5" /> Lançar</Button>
      </div>
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Plataforma</TableHead>
              <TableHead>Loja / funil</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {investimentos.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium whitespace-nowrap">{rotuloMes(i.mes)}</TableCell>
                <TableCell>{i.plataforma}</TableCell>
                <TableCell className="text-slate-600">
                  {i.pipelineId ? (nomeFunil.get(i.pipelineId) ?? i.pipelineId) : <span className="text-slate-400">grupo inteiro</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtBRL(i.valor)}</TableCell>
                <TableCell className="text-slate-500 text-xs">{i.observacao ?? ''}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(i)}><Pencil size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setExcluindo(i)}><Trash2 size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {investimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                  Nada lançado ainda — sem verba, o relatório mostra volume mas não mostra custo.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {criando && <InvestimentoDialog funis={funis} onClose={() => setCriando(false)} />}
      {editando && <InvestimentoDialog funis={funis} inicial={editando} onClose={() => setEditando(null)} />}
      <Dialog open={!!excluindo} onOpenChange={(v: boolean) => { if (!v) setExcluindo(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader><DialogTitle>Excluir lançamento?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            {excluindo && <>O lançamento de <strong>{fmtBRL(excluindo.valor)}</strong> em {excluindo.plataforma} ({rotuloMes(excluindo.mes)}) será removido.</>}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={excluir} disabled={pending}>{pending ? 'Excluindo...' : 'Excluir'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
