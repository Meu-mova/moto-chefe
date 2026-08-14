'use client'
import { useState } from 'react'
import { hojeBrt } from '@/lib/data-venda'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { criarDespesaAction, editarDespesaAction } from '../actions'
import type { Loja, DespesaRow } from '../types'

const FORMAS_PAGAMENTO = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão']

const BANCOS = [
  'Sicoob', 'Itaú', 'Bradesco', 'Caixa Econômica Federal',
  'Nubank', 'Santander', 'BTG Pactual', 'Outro',
]

type Props = {
  lojas: Loja[]
  categorias: string[]
  modo: 'criar' | 'editar'
  inicial?: DespesaRow
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function DespesaDialog({ lojas, categorias, modo, inicial, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const hoje = hojeBrt()

  const [lojaId, setLojaId]               = useState(inicial?.lojaId ?? '')
  const [categoria, setCategoria]         = useState(inicial?.categoria ?? '')
  const [descricao, setDescricao]         = useState(inicial?.descricao ?? '')
  const [valor, setValor]                 = useState(inicial?.valor ?? '')
  const [data, setData]                   = useState(inicial?.data ?? hoje)
  const [formaPagamento, setFormaPagamento] = useState(inicial?.formaPagamento ?? '')
  const [banco, setBanco]                 = useState(inicial?.banco ?? '')

  function resetar() {
    setLojaId('')
    setCategoria('')
    setDescricao('')
    setValor('')
    setData(hoje)
    setFormaPagamento('')
    setBanco('')
  }

  async function handleSalvar() {
    if (!categoria || !valor || !data || !formaPagamento || !banco) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setLoading(true)
    try {
      const dados = {
        lojaId:         lojaId || null,
        categoria,
        descricao:      descricao.trim() || undefined,
        valor,
        data,
        formaPagamento,
        banco,
      }
      if (modo === 'criar') {
        await criarDespesaAction(dados)
        toast.success('Despesa registrada!')
        resetar()
      } else {
        await editarDespesaAction(inicial!.id, dados)
        toast.success('Despesa atualizada!')
      }
      onOpenChange?.(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modo === 'criar' ? 'Nova Despesa' : 'Editar Despesa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loja */}
          <div className="space-y-1.5">
            <Label className="text-xs">Loja</Label>
            <select
              value={lojaId}
              onChange={e => setLojaId(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="">Geral — empresa toda</option>
              {lojas.map(l => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria *</Label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="">Selecione...</option>
              {categorias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <CurrencyInput value={valor} onChange={setValor} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Forma de pagamento + Banco */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento *</Label>
              <select
                value={formaPagamento}
                onChange={e => setFormaPagamento(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="">Selecione...</option>
                {FORMAS_PAGAMENTO.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Banco *</Label>
              <select
                value={banco}
                onChange={e => setBanco(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="">Selecione...</option>
                {BANCOS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição <span className="text-slate-400">(opcional)</span></Label>
            <Textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes do pagamento..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Registrar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NovaDespesaButton({ lojas, categorias }: { lojas: Loja[]; categorias: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova Despesa
      </Button>
      <DespesaDialog lojas={lojas} categorias={categorias} modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}

export function EditarDespesaButton({ lojas, despesa, categorias }: { lojas: Loja[]; despesa: DespesaRow; categorias: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-slate-400 hover:text-slate-700 p-1"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <DespesaDialog
        key={`${despesa.id}-${despesa.valor}-${despesa.data}`}
        lojas={lojas} categorias={categorias} modo="editar" inicial={despesa} open={open} onOpenChange={setOpen}
      />
    </>
  )
}
