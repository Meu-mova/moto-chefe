'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { marcarSinalDemandaAction, desmarcarSinalDemandaAction } from '../actions'
import { ClienteCampos, CLIENTE_VAZIO, clienteCompleto, type ClienteForm } from './cliente-campos'

type Props = {
  demandaId: string
  sinalRecebido: boolean
  valorSinal: string | null
  isAdmin: boolean
}

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'link_pagamento', label: 'Link de Pagamento' },
  { value: 'transferencia', label: 'Transferência Bancária' },
]

export function MarcarSinalButton({ demandaId, sinalRecebido, valorSinal, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [meioPagamento, setMeioPagamento] = useState('')
  const [cliente, setCliente] = useState<ClienteForm>(CLIENTE_VAZIO)
  const [pending, startTransition] = useTransition()

  const valido = clienteCompleto(cliente) && !!meioPagamento

  function marcar() {
    if (!valido) return
    const parsedValor = valor.trim() ? parseFloat(valor.trim().replace(/\./g, '').replace(',', '.')) : NaN
    const v = !isNaN(parsedValor) ? parsedValor : null
    startTransition(async () => {
      try {
        await marcarSinalDemandaAction(demandaId, { ...cliente, valorSinal: v, meioPagamento })
        toast.success('Sinal registrado — recibo disponível')
        setOpen(false)
        setValor(''); setMeioPagamento(''); setCliente(CLIENTE_VAZIO)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao registrar sinal')
      }
    })
  }

  function desmarcar() {
    startTransition(async () => {
      try {
        await desmarcarSinalDemandaAction(demandaId)
        toast.success('Prioridade removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao desmarcar')
      }
    })
  }

  if (sinalRecebido) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-2 py-1">
          Prioridade{valorSinal ? ` · ${fmt(valorSinal)}` : ''}
        </span>
        <a
          href={`/demandas/${demandaId}/imprimir`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 underline"
          title="Imprimir recibo do sinal"
        >
          <Printer size={12} /> Recibo
        </a>
        {isAdmin && (
          <button
            onClick={desmarcar}
            disabled={pending}
            className="text-xs text-slate-400 hover:text-red-500 underline"
          >
            desmarcar
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Marcar sinal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recebimento de sinal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Registrar o sinal exige o cadastro completo do cliente — isso gera o recibo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor do sinal</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Meio de pagamento <span className="text-red-500">*</span></Label>
                <select
                  value={meioPagamento}
                  onChange={e => setMeioPagamento(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="" disabled>Selecionar</option>
                  {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <ClienteCampos value={cliente} onChange={setCliente} />
            <Button onClick={marcar} disabled={pending || !valido} className="w-full">
              {pending ? 'Salvando…' : 'Confirmar sinal + gerar recibo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
