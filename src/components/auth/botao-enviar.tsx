'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

/** Botão do formulário de entrada: hover, onda no ponto do clique e brilho enquanto a action roda. */
export function BotaoEnviar({ children, enviando }: { children: React.ReactNode; enviando: string }) {
  const { pending } = useFormStatus()
  const [ondas, setOndas] = useState<{ id: number; x: number; y: number; t: number }[]>([])

  function onda(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const t = Math.max(r.width, r.height)
    const id = Date.now()
    setOndas(o => [...o, { id, x: e.clientX - r.left - t / 2, y: e.clientY - r.top - t / 2, t }])
    setTimeout(() => setOndas(o => o.filter(x => x.id !== id)), 650)
  }

  return (
    <button
      type="submit"
      disabled={pending}
      onMouseDown={onda}
      data-enviando={pending || undefined}
      className="mova-botao flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {ondas.map(o => <span key={o.id} className="mova-ripple" style={{ left: o.x, top: o.y, width: o.t, height: o.t }} />)}
      <span className="relative flex items-center gap-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? enviando : children}
      </span>
    </button>
  )
}
