'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { registrarPagamentoOSAction } from '../../actions'
import { toast } from 'sonner'

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Cortesia / Garantia']
const FORMAS_CARTAO = new Set(['Cartão de Crédito', 'Cartão de Débito'])
const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone',       label: 'Stone' },
  { value: 'pagueveloz',  label: 'PaguéVeloz' },
  { value: 'cielo',       label: 'Cielo' },
  { value: 'getnet',      label: 'GetNet' },
  { value: 'redecard',    label: 'Redecard' },
]

type Props = { osId: string; valorTotal: number; formaPagamento: string }

export function OSPagamentoPanel({ osId, valorTotal, formaPagamento }: Props) {
  const [pending, start] = useTransition()
  const [valor, setValor] = useState(valorTotal > 0 ? valorTotal.toFixed(2) : '')
  const [forma, setForma] = useState(formaPagamento)
  const [operadora, setOperadora] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [autorizacao, setAutorizacao] = useState('')

  const ehCartao = FORMAS_CARTAO.has(forma)

  function salvar() {
    const v = parseFloat(valor)
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    if (!forma) { toast.error('Selecione a forma de pagamento'); return }
    start(async () => {
      try {
        await registrarPagamentoOSAction(osId, {
          valorTotal: v,
          formaPagamento: forma,
          ...(ehCartao && operadora ? { operadora } : {}),
          ...(ehCartao && parcelas ? { parcelas: parseInt(parcelas, 10) } : {}),
          ...(ehCartao && autorizacao.trim() ? { autorizacao: autorizacao.trim().toUpperCase() } : {}),
        })
        toast.success('Pagamento registrado')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Valor cobrado (R$)</Label>
            <Input type="number" min="0" step="0.01" value={valor}
              onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Forma de pagamento</Label>
            <select value={forma} onChange={e => setForma(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Selecione...</option>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {ehCartao && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Operadora</Label>
              <select value={operadora} onChange={e => setOperadora(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                <option value="">Selecione...</option>
                {OPERADORAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas</Label>
              <select value={parcelas} onChange={e => setParcelas(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            </div>
          </div>
        )}
        {ehCartao && (
          <div className="space-y-1.5">
            <Label className="text-xs">Autorização (impresso no comprovante)</Label>
            <Input value={autorizacao} onChange={e => setAutorizacao(e.target.value)} placeholder="Opcional" />
          </div>
        )}

        <Button size="sm" onClick={salvar} disabled={pending} className="w-full">
          {pending ? 'Salvando…' : formaPagamento ? 'Atualizar pagamento' : 'Registrar pagamento'}
        </Button>
        {formaPagamento && (
          <p className="text-xs text-green-600 text-center">
            Pago: {formaPagamento} · {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
