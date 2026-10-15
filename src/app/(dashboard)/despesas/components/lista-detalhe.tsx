'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Props<T> = {
  itens: T[]
  idDe: (item: T) => string
  /** Conteúdo da linha (dentro do botão). */
  linha: (item: T) => React.ReactNode
  /** Classe da borda esquerda da linha: o status vai na borda, não em caixa colorida. */
  borda?: (item: T) => string
  detalhe: (item: T) => React.ReactNode
  tituloDetalhe: string
  descricaoDetalhe: (item: T) => string
  vazio: React.ReactNode
}

/**
 * Lista com detalhe: do tablet para cima é lista à esquerda + painel do selecionado à direita;
 * no celular o toque abre o detalhe em tela cheia (padrão do cancelar-venda-button).
 */
export function ListaDetalhe<T>({ itens, idDe, linha, borda, detalhe, tituloDetalhe, descricaoDetalhe, vazio }: Props<T>) {
  const mobile = useIsMobile()
  const [selId, setSelId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  const selecionado = itens.find(i => idDe(i) === selId)
  // Excluiu ou saiu do filtro: fecha o detalhe em vez de mostrar, em tela cheia, outro item.
  useEffect(() => {
    if (aberto && !selecionado) setAberto(false)
  }, [aberto, selecionado])

  if (itens.length === 0) return <div className="rounded-lg border border-border">{vazio}</div>

  // No tablet/desktop o painel nunca fica vazio: sem escolha (ou se a escolhida saiu do filtro) vale o primeiro.
  const atual = selecionado ?? itens[0]

  function escolher(item: T) {
    setSelId(idDe(item))
    if (mobile) setAberto(true)
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border md:grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_380px]">
        <ul className="divide-y divide-border">
          {itens.map(item => (
            <li key={idDe(item)}>
              <button
                type="button"
                onClick={() => escolher(item)}
                aria-current={!mobile && idDe(item) === idDe(atual)}
                className={cn(
                  'flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left hover:bg-muted/50',
                  borda?.(item) ?? 'border-l-transparent',
                  idDe(item) === idDe(atual) && 'md:bg-muted',
                )}
              >
                {linha(item)}
              </button>
            </li>
          ))}
        </ul>
        <aside key={idDe(atual)} className="hidden space-y-4 border-l border-border p-5 md:block">
          {detalhe(atual)}
        </aside>
      </div>

      <Dialog open={mobile && aberto && !!selecionado} onOpenChange={setAberto}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:max-w-lg max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-2 md:px-4">
            <button type="button" onClick={() => setAberto(false)} aria-label="Voltar" className="rounded-md p-2 text-foreground hover:bg-muted md:hidden">
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">{tituloDetalhe}</DialogTitle>
              <DialogDescription className="truncate text-xs">{descricaoDetalhe(atual)}</DialogDescription>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted md:block">
              <X className="size-5" />
            </button>
          </div>
          <div key={idDe(atual)} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{detalhe(atual)}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
