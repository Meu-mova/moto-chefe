'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-react'
import { registrarPagamentoOSAction } from '../../actions'
import type { PgtoOS } from '@/lib/conciliacao-status'
import { toast } from 'sonner'

const FORMAS = [
  { value: 'pix',             label: 'PIX' },
  { value: 'dinheiro',        label: 'Dinheiro' },
  { value: 'cartao_credito',  label: 'Cartão de Crédito' },
  { value: 'cartao_debito',   label: 'Cartão de Débito' },
  { value: 'transferencia',   label: 'Transferência' },
  { value: 'cortesia',        label: 'Cortesia / Garantia' },
]
const FORMAS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone',       label: 'Stone' },
  { value: 'pagueveloz',  label: 'PaguéVeloz' },
  { value: 'cielo',       label: 'Cielo' },
  { value: 'getnet',      label: 'GetNet' },
  { value: 'redecard',    label: 'Redecard' },
]

type Linha = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string }

type Props = {
  osId: string
  valorTotal: number
  pagamentosIniciais: PgtoOS[]
  jaPago: boolean
  aprovacaoPendente?: boolean
}

function linhasIniciais(pagamentos: PgtoOS[], valorTotal: number): Linha[] {
  if (pagamentos.length > 0) {
    return pagamentos.map((p, i) => ({
      id: String(i),
      tipo: p.tipo,
      valor: String(p.valor),
      operadora: p.operadora,
      parcelas: p.parcelas != null ? String(p.parcelas) : undefined,
      autorizacao: p.autorizacao,
    }))
  }
  return [{ id: '1', tipo: '', valor: valorTotal > 0 ? valorTotal.toFixed(2) : '' }]
}

export function OSPagamentoPanel({ osId, valorTotal, pagamentosIniciais, jaPago, aprovacaoPendente }: Props) {
  const [pending, start] = useTransition()
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(pagamentosIniciais, valorTotal))

  const addLinha = () => setLinhas(l => [...l, { id: Date.now().toString(), tipo: '', valor: '' }])
  const removeLinha = (id: string) => setLinhas(l => l.filter(x => x.id !== id))
  const updateLinha = (id: string, campo: keyof Linha, val: string) =>
    setLinhas(l => l.map(x => x.id === id ? { ...x, [campo]: val } : x))

  const somatorio = linhas.reduce((a, l) => a + (parseFloat(l.valor) || 0), 0)
  const somatorioOk = Math.abs(somatorio - valorTotal) < 0.01
  const linhasCompletas = linhas.every(l => l.tipo && l.valor)

  function salvar() {
    if (!linhasCompletas) { toast.error('Preencha forma e valor de todas as linhas'); return }
    if (!somatorioOk) { toast.error('A soma dos pagamentos precisa bater com o valor total'); return }
    start(async () => {
      try {
        const resultado = await registrarPagamentoOSAction(osId, {
          valorTotal,
          pagamentos: linhas.map(l => ({
            tipo: l.tipo,
            valor: parseFloat(l.valor),
            ...(FORMAS_CARTAO.has(l.tipo) && l.operadora   ? { operadora: l.operadora }                     : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.parcelas    ? { parcelas: parseInt(l.parcelas, 10) }         : {}),
            ...(FORMAS_CARTAO.has(l.tipo) && l.autorizacao?.trim() ? { autorizacao: l.autorizacao.trim().toUpperCase() } : {}),
          })),
        })
        toast.success(resultado.aguardandoAprovacao
          ? 'Pagamento por transferência enviado para aprovação'
          : 'Pagamento registrado')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function concluirGratuita() {
    start(async () => {
      try {
        await registrarPagamentoOSAction(osId, { valorTotal: 0, pagamentos: [] })
        toast.success('OS concluída como gratuita')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  if (valorTotal < 0.01) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jaPago ? (
            <p className="text-sm text-green-600">✓ OS gratuita — sem pendência de pagamento.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">Esta OS não tem cobrança (R$ 0,00).</p>
              <Button size="sm" onClick={concluirGratuita} disabled={pending} className="w-full">
                {pending ? 'Concluindo…' : 'Concluir OS gratuita'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aprovacaoPendente && (
          <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
            Pagamento por transferência bancária enviado para aprovação — a OS só fica marcada como paga quando for aprovado.
          </p>
        )}

        {linhas.map(l => (
          <div key={l.id} className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <div className="flex gap-2 items-center">
              <select value={l.tipo} onChange={e => updateLinha(l.id, 'tipo', e.target.value)}
                className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <CurrencyInput className="w-28" placeholder="0,00" value={l.valor} onChange={v => updateLinha(l.id, 'valor', v)} />
              {linhas.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeLinha(l.id)}>
                  <X size={14} />
                </Button>
              )}
            </div>

            {FORMAS_CARTAO.has(l.tipo) && (
              <div className="grid grid-cols-2 gap-2">
                <select value={l.operadora ?? ''} onChange={e => updateLinha(l.id, 'operadora', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Operadora...</option>
                  {OPERADORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={l.parcelas ?? ''} onChange={e => updateLinha(l.id, 'parcelas', e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Parcelas...</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            )}
            {FORMAS_CARTAO.has(l.tipo) && (
              <Input
                value={l.autorizacao ?? ''}
                onChange={e => updateLinha(l.id, 'autorizacao', e.target.value)}
                placeholder="Autorização (impresso no comprovante) — opcional"
              />
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" className="gap-1 w-full" onClick={addLinha}>
          <Plus size={14} /> Adicionar forma de pagamento
        </Button>

        <div className={`text-xs px-3 py-2 rounded-md border font-medium ${
          somatorioOk ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          Soma: {somatorio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          {' '}/ Total: {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>

        <Button size="sm" onClick={salvar} disabled={pending || !somatorioOk || !linhasCompletas} className="w-full">
          {pending ? 'Salvando…' : jaPago ? 'Atualizar pagamento' : 'Registrar pagamento'}
        </Button>
      </CardContent>
    </Card>
  )
}
