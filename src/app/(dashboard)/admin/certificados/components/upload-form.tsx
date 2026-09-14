'use client'
import { useState } from 'react'
import { enviarCertificado } from '../actions'
import { Card, CardContent } from '@/components/ui/card'

export function UploadForm() {
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function acao(formData: FormData) {
    setEnviando(true)
    setMsg(null)
    const r = await enviarCertificado(formData)
    setMsg(r.ok
      ? { tipo: 'ok', texto: `Certificado de ${r.titular} guardado.` }
      : { tipo: 'erro', texto: r.erro })
    setEnviando(false)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={acao} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Arquivo .pfx / .p12</label>
            <input type="file" name="arquivo" accept=".pfx,.p12" required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Senha do certificado</label>
            <input type="password" name="senha" required autoComplete="off"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none" />
          </div>
          <button type="submit" disabled={enviando}
            className="rounded-md bg-slate-800 text-white px-3 h-9 text-sm hover:bg-slate-700 disabled:opacity-60">
            {enviando ? 'Enviando…' : 'Enviar certificado'}
          </button>
          {msg && (
            <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.texto}</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
