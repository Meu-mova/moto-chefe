'use client'
import { Button } from '@/components/ui/button'
import { desconectarBlingAction } from '../actions'
import { useTransition } from 'react'
import { Plug, PlugZap } from 'lucide-react'

type Props = { conectado: boolean }

export function BlingConnectButton({ conectado }: Props) {
  const [pending, start] = useTransition()

  if (conectado) {
    return (
      <div className="flex gap-2">
        <a href="/api/bling/connect">
          <Button variant="outline" size="sm" className="gap-1.5">
            <PlugZap size={15} /> Reconectar
          </Button>
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() => start(() => desconectarBlingAction())}
        >
          Desconectar
        </Button>
      </div>
    )
  }

  return (
    <a href="/api/bling/connect">
      <Button size="sm" className="gap-1.5">
        <Plug size={15} /> Conectar ao Bling
      </Button>
    </a>
  )
}
