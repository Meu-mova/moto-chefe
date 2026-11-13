'use client'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  titulo: string
  subtitulo?: string
  textoDoBotao: string
  ocupado?: boolean
  aoConfirmar: () => void
  children: ReactNode
}

/**
 * Moldura das janelas que aparecem ao entrar (comunicado, Novidades da versão): sem X, não fecha
 * clicando fora nem com Esc, só pelo botão; o texto rola dentro da janela.
 */
export function JanelaDeAviso({ titulo, subtitulo, textoDoBotao, ocupado = false, aoConfirmar, children }: Props) {
  return (
    <Dialog open onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg">{titulo}</DialogTitle>
          {subtitulo && <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>}
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto text-sm text-foreground py-2 leading-relaxed">
          {children}
        </div>
        <DialogFooter>
          <Button onClick={aoConfirmar} disabled={ocupado} className="w-full sm:w-auto">
            {textoDoBotao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
