'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { lancarCorrespondenciaAction, removerCorrespondenciaAction } from '../actions'

type Correspondencia = {
  tipo: 'venda' | 'os' | null
  vendaNumero: number | null
  osNumero: number | null
}

type Props = { id: string; correspondencia: Correspondencia }

export function CorrespondenciaForm({ id, correspondencia }: Props) {
  const [pending, start] = useTransition()
  const [tipo, setTipo] = useState<'venda' | 'os'>('venda')
  const [numero, setNumero] = useState('')

  if (correspondencia.tipo) {
    const label = correspondencia.tipo === 'venda'
      ? `Venda #${correspondencia.vendaNumero}`
      : `OS #${correspondencia.osNumero}`

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

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          {label}
        </span>
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
      <Select value={tipo} onValueChange={v => setTipo(v as 'venda' | 'os')}>
        <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="venda">Venda</SelectItem>
          <SelectItem value="os">OS</SelectItem>
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
