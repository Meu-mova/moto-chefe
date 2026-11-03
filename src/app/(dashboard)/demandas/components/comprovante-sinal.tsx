'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCEPT_COMPROVANTE, conferirComprovante } from '@/lib/comprovante-arquivo'
import { abrirComprovanteSinalAction } from '../actions'

/** Campo obrigatório do comprovante do sinal. `onChange(null)` quando falta ou não serve. */
export function ComprovanteSinalCampo({ onChange }: { onChange: (arquivo: File | null) => void }) {
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Label htmlFor="comprovante-sinal">Comprovante do valor do sinal <span className="text-destructive">*</span></Label>
      <Input
        id="comprovante-sinal"
        type="file"
        accept={ACCEPT_COMPROVANTE}
        onChange={e => {
          const arquivo = e.target.files?.[0] ?? null
          const c = arquivo ? conferirComprovante(arquivo) : null
          setErro(c && !c.ok ? c.erro : null)
          onChange(c?.ok ? arquivo : null)
        }}
        className="cursor-pointer file:mr-3 file:px-3 file:py-1 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-border"
      />
      {erro ? <p className="text-xs text-destructive">{erro}</p> : <p className="text-xs text-muted-foreground">Foto ou PDF, até 10MB. Fica guardado por 90 dias.</p>}
    </div>
  )
}

/** O arquivo vai num FormData à parte do resto do sinal. */
export function formDataDoComprovante(arquivo: File): FormData {
  const fd = new FormData()
  fd.append('comprovante', arquivo)
  return fd
}

/** Abre o comprovante numa aba: a aba nasce no clique (senão o navegador bloqueia) e recebe o link quando ele chega. */
export function AbrirComprovanteSinal({ demandaId }: { demandaId: string }) {
  const [abrindo, setAbrindo] = useState(false)
  async function abrir() {
    const aba = window.open('', '_blank')
    setAbrindo(true)
    try {
      const url = await abrirComprovanteSinalAction(demandaId)
      if (aba) aba.location.href = url
      else window.location.href = url
    } catch (e: unknown) {
      aba?.close()
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir o comprovante')
    } finally {
      setAbrindo(false)
    }
  }
  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abrindo}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
      title="Abrir o comprovante do sinal"
    >
      <Paperclip size={12} /> {abrindo ? 'Abrindo…' : 'Comprovante'}
    </button>
  )
}
