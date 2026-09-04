'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2 } from 'lucide-react'
import { criarDemandaAction } from '../actions'
import { ClienteCampos, CLIENTE_VAZIO, clienteCompleto, type ClienteForm } from './cliente-campos'

type Loja = { id: string; nome: string }
type Modelo = { id: string; marca: string; modelo: string }
type Props = { lojas: Loja[]; lojaIdFixa: string | null; modelos: Modelo[]; cores: string[] }

const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'link_pagamento', label: 'Link de Pagamento' },
  { value: 'transferencia', label: 'Transferência Bancária' },
]

export function NovaDemandaForm({ lojas, lojaIdFixa, modelos, cores }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [cor, setCor] = useState('')
  const [lojaId, setLojaId] = useState(lojaIdFixa ?? '')
  const [sinalRecebido, setSinalRecebido] = useState(false)
  const [valorSinal, setValorSinal] = useState('')
  const [meioPagamento, setMeioPagamento] = useState('')
  const [cliente, setCliente] = useState<ClienteForm>(CLIENTE_VAZIO)
  const [loading, setLoading] = useState(false)
  const [reciboId, setReciboId] = useState<string | null>(null)

  const modeloSel = modelos.find(m => m.id === modeloId)
  const modeloLabel = modeloSel ? `${modeloSel.marca} ${modeloSel.modelo}` : ''

  const sinalValido = !sinalRecebido || (clienteCompleto(cliente) && !!meioPagamento)
  const formValido = !!modeloId && !!cor.trim() && !!lojaId && sinalValido

  function reset() {
    setModeloId(''); setCor(''); setSinalRecebido(false); setValorSinal(''); setMeioPagamento('')
    setCliente(CLIENTE_VAZIO)
    if (!lojaIdFixa) setLojaId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formValido) return
    setLoading(true)
    try {
      const parsedValor = valorSinal.trim() ? parseFloat(valorSinal.trim().replace(/\./g, '').replace(',', '.')) : NaN
      const v = !isNaN(parsedValor) ? parsedValor : null
      const res = await criarDemandaAction({
        modelo: modeloLabel,
        modeloId,
        cor,
        lojaId,
        sinal: sinalRecebido ? { ...cliente, valorSinal: v, meioPagamento } : null,
      })
      if (sinalRecebido) {
        setReciboId(res.id)
      } else {
        toast.success('Demanda registrada')
      }
      reset()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar demanda')
    } finally {
      setLoading(false)
    }
  }

  if (reciboId) {
    return (
      <div className="bg-white border rounded-lg p-6 flex flex-col items-center gap-4 text-center">
        <CheckCircle2 size={40} className="text-green-600" />
        <div>
          <p className="font-semibold text-slate-800">Demanda com sinal registrada!</p>
          <p className="text-sm text-slate-500 mt-1">Entregue o recibo ao cliente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReciboId(null)}>Nova demanda</Button>
          <a
            href={`/demandas/${reciboId}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 text-white text-sm font-medium h-9 px-4 hover:bg-slate-800"
          >
            Imprimir recibo
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 space-y-4">
      <h2 className="font-semibold text-sm">Nova demanda</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <select
            value={modeloId}
            onChange={e => setModeloId(e.target.value)}
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>Selecionar modelo</option>
            {modelos.map(m => (
              <option key={m.id} value={m.id}>{m.marca} {m.modelo}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Cor</Label>
          <select
            value={cor}
            onChange={e => setCor(e.target.value)}
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>Selecionar cor</option>
            {cores.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Loja</Label>
          {lojaIdFixa ? (
            <Input value={lojas.find(l => l.id === lojaIdFixa)?.nome ?? ''} disabled />
          ) : (
            <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')} required>
              <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
              <SelectContent>
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={sinalRecebido}
          onChange={e => setSinalRecebido(e.target.checked)}
          className="rounded border-slate-300"
        />
        Já recebi um sinal / recebimento prévio do cliente
      </label>

      {sinalRecebido && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest">Sinal — cadastro do cliente (gera recibo)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor do sinal</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={valorSinal} onChange={e => setValorSinal(e.target.value)} />
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
        </div>
      )}

      <Button type="submit" disabled={loading || !formValido}>
        {loading ? 'Salvando…' : sinalRecebido ? 'Registrar demanda + recibo' : 'Registrar demanda'}
      </Button>
    </form>
  )
}
