'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { alterarTransferenciaEntreGruposAction } from '../actions'

type Conta = { id: string; nome: string; ligada: boolean; grupos: number }

/** Chave por Conta (#552): só aparece Conta com mais de um grupo, a única em que ela muda algo. */
export function TransferenciaContas({ contas }: { contas: Conta[] }) {
  const router = useRouter()
  const [alvo, setAlvo] = useState<Conta | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!alvo) return
    setSalvando(true)
    const r = await alterarTransferenciaEntreGruposAction(alvo.id, !alvo.ligada)
    setSalvando(false)
    if (!r.ok) { toast.error(r.erro); return }
    toast.success(alvo.ligada ? 'Transferência entre grupos desligada' : 'Transferência entre grupos ligada')
    setAlvo(null)
    router.refresh()
  }

  if (contas.length === 0) return null
  return (
    <div className="bg-card rounded-lg border p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Transferência entre grupos</h2>
        <p className="text-sm text-muted-foreground">
          Ligada, a moto pode ir para loja de outro grupo da mesma Conta, e a NF de saída sai pelo grupo que comprou a moto.
          Nunca vale entre Contas.
        </p>
      </div>
      <ul className="divide-y">
        {contas.map(c => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm">{c.nome} <span className="text-muted-foreground">({c.grupos} grupos)</span></span>
            <span className="flex items-center gap-2">
              <Badge variant={c.ligada ? 'default' : 'secondary'}>{c.ligada ? 'Ligada' : 'Desligada'}</Badge>
              <Button size="sm" variant="outline" onClick={() => setAlvo(c)}>{c.ligada ? 'Desligar' : 'Ligar'}</Button>
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={!!alvo} onOpenChange={o => { if (!o) setAlvo(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{alvo?.ligada ? 'Desligar' : 'Ligar'} transferência entre grupos?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {alvo?.ligada
              ? `Na Conta ${alvo?.nome}, a NF de saída volta a sair pelo grupo da loja da venda, e a moto não vai mais para loja de outro grupo.`
              : `Na Conta ${alvo?.nome}, a NF de saída de moto vendida em loja de outro grupo vai sair pelo CNPJ do grupo que comprou a moto. Fica no log.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={salvando}>Voltar</Button>
            <Button onClick={confirmar} disabled={salvando}>{alvo?.ligada ? 'Desligar' : 'Ligar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
