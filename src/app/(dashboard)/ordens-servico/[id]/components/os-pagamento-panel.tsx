'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { registrarPagamentoOSAction } from '../../actions'
import { toast } from 'sonner'

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Cortesia / Garantia']

type Props = { osId: string; valorTotal: number; formaPagamento: string }

export function OSPagamentoPanel({ osId, valorTotal, formaPagamento }: Props) {
  const [pending, start] = useTransition()
  const [valor, setValor] = useState(valorTotal > 0 ? valorTotal.toFixed(2) : '')
  const [forma, setForma] = useState(formaPagamento)

  function salvar() {
    const v = parseFloat(valor)
    if (isNaN(v) || v < 0) { toast.error('Valor inválido'); return }
    if (!forma) { toast.error('Selecione a forma de pagamento'); return }
    start(async () => {
      try {
        await registrarPagamentoOSAction(osId, { valorTotal: v, formaPagamento: forma })
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
