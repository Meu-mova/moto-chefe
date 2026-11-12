'use client'

import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Props = {
  aberto: boolean
  /** Voltar, X e Escape. Quem chama decide se fecha (ex.: não fecha enquanto envia). */
  onFechar: () => void
  titulo: React.ReactNode
  descricao?: React.ReactNode
  /** Enquanto envia: voltar e X ficam desabilitados. */
  travado?: boolean
  /** Clicar fora chama o onFechar. Padrão: não (diálogo com passos ou formulário longo). */
  fechaClicandoFora?: boolean
  /** Largura e altura do sm para cima (ex.: `sm:max-w-lg`). */
  className?: string
  children: React.ReactNode
}

/**
 * Diálogo que no celular ocupa a tela, como uma página, com a seta de voltar; do sm para cima é um
 * diálogo comum com o X.
 */
export function DialogoTelaCheia({ aberto, onFechar, titulo, descricao, travado = false, fechaClicandoFora = false, className, children }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }} disablePointerDismissal={!fechaClicandoFora}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0',
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
          <button type="button" onClick={onFechar} disabled={travado} aria-label="Voltar" className="rounded-md p-2 text-foreground hover:bg-muted disabled:opacity-50 sm:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-semibold">{titulo}</DialogTitle>
            {descricao && <DialogDescription className="truncate text-xs">{descricao}</DialogDescription>}
          </div>
          <button type="button" onClick={onFechar} disabled={travado} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 sm:block">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}
