'use client'
import { useState, useTransition } from 'react'
import { FileCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmarNFSaidaAction } from '../../vendas/actions'

type Props = {
  motoId: string
  descricao: string
}

export function NfSaidaButton({ motoId, descricao }: Props) {
  const [aberto, setAberto] = useState(false)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()

  function abrir() {
    setNf('')
    setErro('')
    setAberto(true)
  }

  function confirmar() {
    if (!nf.trim()) {
      setErro('Informe o número da NF')
      return
    }
    setErro('')
    startTransition(async () => {
      try {
        await confirmarNFSaidaAction(motoId, nf.trim())
        setAberto(false)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={abrir}
        className="h-8 gap-1.5 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
        title="Inserir NF de saída"
      >
        <FileCheck size={14} />
        NF Saída
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Inserir NF de Saída</DialogTitle>
            <p className="text-sm text-slate-500">{descricao}</p>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="nf-input">Número da Nota Fiscal</Label>
            <Input
              id="nf-input"
              value={nf}
              onChange={e => setNf(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmar()}
              placeholder="Ex: 001234"
              autoFocus
            />
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={pending || !nf.trim()}>
              {pending ? 'Confirmando…' : 'Confirmar e Finalizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
