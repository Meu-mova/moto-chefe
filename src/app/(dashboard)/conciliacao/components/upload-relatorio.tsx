'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Loader2 } from 'lucide-react'
import { importarRelatorioAction } from '../actions'

export function UploadRelatorio() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [operadora, setOperadora] = useState('infinitypay')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Selecione um arquivo CSV'); return }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.set('operadora', operadora)
      fd.set('file', file)
      const result = await importarRelatorioAction(fd)
      const partes = [`${result.importadas} importadas`]
      if (result.conciliadas) partes.push(`${result.conciliadas} conciliadas automaticamente`)
      if (result.duplicadas)  partes.push(`${result.duplicadas} duplicatas ignoradas`)
      toast.success(partes.join(' · '))
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <Select value={operadora} onValueChange={v => v && setOperadora(v)}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="infinitypay">InfinityPay</SelectItem>
          <SelectItem value="stone">Stone</SelectItem>
          <SelectItem value="pagueveloz">PaguéVeloz</SelectItem>
        </SelectContent>
      </Select>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
      />

      <Button type="submit" size="sm" disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        <span className="ml-1.5">{loading ? 'Importando...' : 'Importar'}</span>
      </Button>
    </form>
  )
}
