'use client'
import { useState, useTransition } from 'react'
import { Zap, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmarNFSaidaAction, emitirNFBlingAction } from '../../vendas/actions'

type Props = {
  motoId: string
  descricao: string
}

export function NfSaidaButton({ motoId, descricao }: Props) {
  const [modalManual, setModalManual] = useState(false)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [pendingManual, startManual] = useTransition()
  const [pendingBling, startBling] = useTransition()

  function abrirManual() {
    setNf('')
    setErro('')
    setModalManual(true)
  }

  function confirmarManual() {
    if (!nf.trim()) { setErro('Informe o número da NF'); return }
    setErro('')
    startManual(async () => {
      try {
        await confirmarNFSaidaAction(motoId, nf.trim())
        setModalManual(false)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }

  function emitirBling() {
    setErro('')
    startBling(async () => {
      try {
        await emitirNFBlingAction(motoId)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao emitir NF no Bling')
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          onClick={emitirBling}
          disabled={pendingBling || pendingManual}
          className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          title="Emitir NF-e automaticamente no Bling"
        >
          <Zap size={13} />
          {pendingBling ? 'Emitindo…' : 'Emitir no Bling'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={abrirManual}
          disabled={pendingBling || pendingManual}
          className="h-8 gap-1 text-xs border-slate-300 text-slate-600"
          title="Inserir número de NF manualmente"
        >
          <Pencil size={12} />
          Manual
        </Button>
      </div>

      {erro && !modalManual && (
        <p className="text-xs text-red-600 mt-1 max-w-xs">{erro}</p>
      )}

      <Dialog open={modalManual} onOpenChange={setModalManual}>
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
              onKeyDown={e => e.key === 'Enter' && confirmarManual()}
              placeholder="Ex: 001234"
              autoFocus
            />
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalManual(false)} disabled={pendingManual}>
              Cancelar
            </Button>
            <Button onClick={confirmarManual} disabled={pendingManual || !nf.trim()}>
              {pendingManual ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
