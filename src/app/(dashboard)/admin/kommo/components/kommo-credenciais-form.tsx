'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { salvarCredenciaisKommoAction } from '../actions'

type Props = { subdominio: string | null; temCredenciais: boolean }

export function KommoCredenciaisForm({ subdominio, temCredenciais }: Props) {
  const [sub, setSub] = useState(subdominio ?? '')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [pending, start] = useTransition()

  function salvar() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Informe Client ID e Client Secret')
      return
    }
    start(async () => {
      try {
        await salvarCredenciaisKommoAction(clientId, clientSecret, sub)
        toast.success('Credenciais salvas')
        setClientId(''); setClientSecret('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Subdomínio da conta <span className="text-muted-foreground text-xs">(opcional — capturado no login)</span></Label>
        <Input value={sub} onChange={e => setSub(e.target.value)} placeholder="ex.: minhaempresa (de minhaempresa.kommo.com)" />
      </div>
      <div className="space-y-1.5">
        <Label>Client ID (ID da integração)</Label>
        <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={temCredenciais ? '•••••• (salvo — preencha p/ trocar)' : 'Cole o Client ID'} />
      </div>
      <div className="space-y-1.5">
        <Label>Client Secret (chave secreta)</Label>
        <Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={temCredenciais ? '•••••• (salvo — preencha p/ trocar)' : 'Cole o Client Secret'} />
      </div>
      <Button onClick={salvar} disabled={pending} size="sm">
        {pending ? 'Salvando…' : 'Salvar credenciais'}
      </Button>
    </div>
  )
}
