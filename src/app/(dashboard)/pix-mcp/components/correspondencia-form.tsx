'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { lancarCorrespondenciaAction, removerCorrespondenciaAction } from '../actions'

type Correspondencia = {
  tipo: 'venda' | 'os' | 'pedido' | 'peca' | null
  vendaNf: string | null
  osNumero: number | null
  pedidoNumero: number | null
  pecaNumero: number | null
  lancadoPorNome: string | null
  lancadoEm: string | null
}

type Props = { id: string; correspondencia: Correspondencia }

const labelPorTipo = {
  venda: (c: Correspondencia) => `NF ${c.vendaNf}`,
  os: (c: Correspondencia) => `OS #${c.osNumero}`,
  pedido: (c: Correspondencia) => `Pedido #${c.pedidoNumero}`,
  peca: (c: Correspondencia) => `PA #${c.pecaNumero}`,
}

export function CorrespondenciaForm({ id, correspondencia }: Props) {
  const [pending, start] = useTransition()
  const [tipo, setTipo] = useState<'venda' | 'os' | 'pedido' | 'peca'>('venda')
  const [numero, setNumero] = useState('')

  if (correspondencia.tipo) {
    const label = labelPorTipo[correspondencia.tipo](correspondencia)

    function remover() {
      start(async () => {
        try {
          await removerCorrespondenciaAction(id)
          toast.success('Correspondência removida')
        } catch (e: any) {
          toast.error(e.message ?? 'Erro ao remover')
        }
      })
    }

    const quemQuando = correspondencia.lancadoPorNome
      ? `${correspondencia.lancadoPorNome}${correspondencia.lancadoEm ? ` · ${new Date(correspondencia.lancadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`
      : null

    return (
      <div className="flex items-center gap-1.5">
        <div>
          <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            {label}
          </span>
          {quemQuando && <p className="text-[11px] text-slate-400 mt-0.5">{quemQuando}</p>}
        </div>
        <button onClick={remover} disabled={pending} title="Remover correspondência" className="text-slate-400 hover:text-red-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  function salvar() {
    if (!numero.trim()) return
    start(async () => {
      try {
        await lancarCorrespondenciaAction(id, tipo, numero.trim())
        toast.success('Correspondência lançada')
        setNumero('')
      } catch (e: any) {
        toast.error(e.message ?? 'Erro ao lançar correspondência')
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={tipo} onValueChange={v => setTipo(v as 'venda' | 'os' | 'pedido' | 'peca')}>
        <SelectTrigger className="h-8 w-20 text-xs">
          <span>{{ venda: 'NF', os: 'OS', pedido: 'Pedido', peca: 'PA' }[tipo]}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="venda">NF</SelectItem>
          <SelectItem value="os">OS</SelectItem>
          <SelectItem value="pedido">Pedido</SelectItem>
          <SelectItem value="peca">PA</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={numero}
        onChange={e => setNumero(e.target.value)}
        placeholder="Nº"
        className="h-8 w-16 text-xs"
        inputMode="numeric"
      />
      <Button size="sm" className="h-8 text-xs" disabled={pending || !numero.trim()} onClick={salvar}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  )
}
