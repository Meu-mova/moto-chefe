'use client'
import { useState, useTransition } from 'react'
import { CircleAlert, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { linkPagamentoAction } from './actions'

/**
 * Linha de uma cobrança em aberto com o "Pagar". Se o link não sai, o motivo fica acima da linha e
 * o botão vira "Tentar de novo", que chama a mesma action (protótipo A do #803).
 */
export function LinhaPagavel({ mensalidadeId, children }: { mensalidadeId: string; children?: React.ReactNode }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const pagar = () => iniciar(async () => {
    const r = await linkPagamentoAction(mensalidadeId)
    if (r.ok) window.location.href = r.url
    else setErro(r.erro)
  })
  return (
    <>
      {erro && (
        <p role="alert" className="flex items-start gap-2.5 rounded-md border border-destructive bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{erro}</span>
        </p>
      )}
      <div className="grid grid-cols-2 items-center gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:gap-4 md:px-5">
        {children}
        <div className="col-span-2 md:col-span-1 [&>button]:w-full md:[&>button]:w-auto">
          <Button size="lg" variant={erro ? 'outline' : 'default'} disabled={pendente} onClick={pagar}>
            {erro && !pendente && <RotateCw aria-hidden />}
            {pendente ? 'Gerando link…' : erro ? 'Tentar de novo' : 'Pagar'}
          </Button>
        </div>
      </div>
    </>
  )
}
