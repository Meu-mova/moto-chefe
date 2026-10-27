'use client'
import { Button } from '@/components/ui/button'
import { desconectarKommoAction } from '../actions'
import { useTransition } from 'react'
import { Plug, PlugZap } from 'lucide-react'

type Props = { conectado: boolean; temCredenciais: boolean }

export function KommoConnectButton({ conectado, temCredenciais }: Props) {
  const [pending, start] = useTransition()

  if (conectado) {
    return (
      <div className="flex gap-2">
        <a href="/api/kommo/connect">
          <Button variant="outline" size="sm" className="gap-1.5">
            <PlugZap size={15} /> Reconectar
          </Button>
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() => start(() => desconectarKommoAction())}
        >
          Desconectar
        </Button>
      </div>
    )
  }

  return (
    <a href={temCredenciais ? '/api/kommo/connect' : undefined}>
      <Button size="sm" className="gap-1.5" disabled={!temCredenciais} title={temCredenciais ? '' : 'Salve o Client ID e Secret primeiro'}>
        <Plug size={15} /> Conectar ao Kommo
      </Button>
    </a>
  )
}
