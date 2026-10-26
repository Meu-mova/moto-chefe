'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CurrencyInput } from '@/components/ui/currency-input'
import { CheckCircle2 } from 'lucide-react'
import { criarDemandaAction } from '../actions'
import { ClienteCampos, CLIENTE_VAZIO, clienteCompleto, type ClienteForm } from './cliente-campos'
import { PagamentosFields, pgtoIncompleto, type Pgto } from '../../estoque/components/pagamentos-fields'

type Loja = { id: string; nome: string }
type Modelo = { id: string; marca: string; modelo: string }
type Props = { lojas: Loja[]; lojaIdFixa: string | null; modelos: Modelo[]; cores: string[] }

export function NovaDemandaForm({ lojas, lojaIdFixa, modelos, cores }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [cor, setCor] = useState('')
  const [lojaId, setLojaId] = useState(lojaIdFixa ?? '')
  const [sinalRecebido, setSinalRecebido] = useState(false)
  const [valorSinal, setValorSinal] = useState('')
  // O sinal pode ser dividido em mais de uma forma — mesmas linhas da venda.
  const [pgtosSinal, setPgtosSinal] = useState<Pgto[]>([{ id: '1', tipo: '', valor: '' }])
  const [cliente, setCliente] = useState<ClienteForm>(CLIENTE_VAZIO)
  const [loading, setLoading] = useState(false)
  const [reciboId, setReciboId] = useState<string | null>(null)

  const modeloSel = modelos.find(m => m.id === modeloId)
  const modeloLabel = modeloSel ? `${modeloSel.marca} ${modeloSel.modelo}` : ''

  const valorSinalNum = parseFloat(valorSinal) || 0
  const somaSinal = pgtosSinal.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0)
  const somaSinalOk = valorSinalNum > 0 && Math.abs(somaSinal - valorSinalNum) < 0.01
  const pgtosSinalOk = pgtosSinal.every(p => p.tipo && p.valor && !pgtoIncompleto(p, null))
  const sinalValido = !sinalRecebido || (clienteCompleto(cliente) && somaSinalOk && pgtosSinalOk)
  const formValido = !!modeloId && !!cor.trim() && !!lojaId && sinalValido

  function reset() {
    setModeloId(''); setCor(''); setSinalRecebido(false); setValorSinal('')
    setPgtosSinal([{ id: '1', tipo: '', valor: '' }])
    setCliente(CLIENTE_VAZIO)
    if (!lojaIdFixa) setLojaId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formValido) return
    setLoading(true)
    try {
      const res = await criarDemandaAction({
        modelo: modeloLabel,
        modeloId,
        cor,
        lojaId,
        sinal: sinalRecebido
          ? {
              ...cliente,
              valorSinal: valorSinalNum,
              pagamentos: pgtosSinal.map(p => ({
                tipo: p.tipo,
                valor: parseFloat(p.valor),
                ...(p.operadora ? { operadora: p.operadora } : {}),
                ...(p.parcelas ? { parcelas: parseInt(p.parcelas) } : {}),
              })),
            }
          : null,
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
      <div className="bg-card border rounded-lg p-6 flex flex-col items-center gap-4 text-center">
        <CheckCircle2 size={40} className="text-success" />
        <div>
          <p className="font-semibold text-foreground">Demanda com sinal registrada!</p>
          <p className="text-sm text-muted-foreground mt-1">Entregue o recibo ao cliente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReciboId(null)}>Nova demanda</Button>
          <a
            href={`/demandas/${reciboId}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-4 hover:bg-primary-hover"
          >
            Imprimir recibo
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-4 space-y-4">
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

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={sinalRecebido}
          onChange={e => setSinalRecebido(e.target.checked)}
          className="rounded border-input"
        />
        Já recebi um sinal / recebimento prévio do cliente
      </label>

      {sinalRecebido && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-4">
          <p className="text-xs font-semibold text-warning uppercase tracking-widest">Sinal — cadastro do cliente (gera recibo)</p>
          <div className="space-y-1 sm:max-w-[240px]">
            <Label>Valor do sinal <span className="text-destructive">*</span></Label>
            <CurrencyInput value={valorSinal} onChange={setValorSinal} placeholder="0,00" />
          </div>

          <div className="space-y-2">
            <Label>Formas de pagamento do sinal <span className="text-destructive">*</span></Label>
            <PagamentosFields
              pgtos={pgtosSinal}
              onAdd={() => setPgtosSinal(p => [...p, { id: Date.now().toString(), tipo: '', valor: '' }])}
              onRemove={id => setPgtosSinal(p => p.filter(x => x.id !== id))}
              onUpdate={(id, campo, val) => setPgtosSinal(p => p.map(x => x.id === id
                ? { ...x, [campo]: val, ...(campo === 'tipo' ? { operadora: undefined, parcelas: undefined } : {}) }
                : x
              ))}
              taxasVenda={null}
            />
          </div>

          {valorSinalNum > 0 && (
            <div className={`text-sm px-3 py-2 rounded-md border font-medium ${
              somaSinalOk ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30'
            }`}>
              {somaSinalOk
                ? `Somatório confere: R$ ${somaSinal.toFixed(2).replace('.', ',')}`
                : `Somatório R$ ${somaSinal.toFixed(2).replace('.', ',')} ≠ Sinal R$ ${valorSinalNum.toFixed(2).replace('.', ',')}`
              }
            </div>
          )}
          <ClienteCampos value={cliente} onChange={setCliente} />
        </div>
      )}

      <Button type="submit" disabled={loading || !formValido}>
        {loading ? 'Salvando…' : sinalRecebido ? 'Registrar demanda + recibo' : 'Registrar demanda'}
      </Button>
    </form>
  )
}
