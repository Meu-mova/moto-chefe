'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { salvarTokenKommoAction } from '../actions'

type Props = { subdominio: string | null }

export function KommoTokenForm({ subdominio }: Props) {
  const [sub, setSub] = useState(subdominio ?? '')
  const [token, setToken] = useState('')
  const [pending, start] = useTransition()

  function salvar() {
    if (!token.trim() || !sub.trim()) {
      toast.error('Informe o subdomínio e o token')
      return
    }
    start(async () => {
      try {
        await salvarTokenKommoAction(token, sub)
        toast.success('Token salvo — conta conectada')
        setToken('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar token')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Subdomínio da conta</Label>
        <Input value={sub} onChange={e => setSub(e.target.value)} placeholder="ex.: motochefebrasil" />
      </div>
      <div className="space-y-1.5">
        <Label>Token de longa duração</Label>
        <Textarea value={token} onChange={e => setToken(e.target.value)} placeholder="Cole aqui o token de longa duração da integração privada" rows={4} className="font-mono text-xs" />
      </div>
      <Button onClick={salvar} disabled={pending} size="sm">
        {pending ? 'Salvando…' : 'Salvar token e conectar'}
      </Button>
    </div>
  )
}
