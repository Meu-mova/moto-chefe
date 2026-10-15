'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { PainelLateral } from '@/components/painel-lateral'
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
 * Lista com detalhe, no padrão de Vendas: no desktop (lg+) é a lista num cartão e, ao clicar numa linha,
 * o painel flutuante à direita (X fecha); abaixo disso o toque abre o detalhe em diálogo (tela cheia no
 * celular, padrão do cancelar-venda-button).
 */
export function ListaDetalhe<T>({ itens, idDe, linha, borda, detalhe, tituloDetalhe, descricaoDetalhe, vazio }: Props<T>) {
  const desktop = useIsDesktop()
  const [selId, setSelId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  const selecionado = itens.find(i => idDe(i) === selId)
  // Excluiu ou saiu do filtro: fecha o detalhe em vez de mostrar, em tela cheia, outro item.
  useEffect(() => {
    if (aberto && !selecionado) setAberto(false)
  }, [aberto, selecionado])

  if (itens.length === 0) return <div className="rounded-lg border border-border">{vazio}</div>

  function escolher(item: T) {
    setSelId(idDe(item))
    if (!desktop) setAberto(true)
  }

  return (
    <>
      <div className="items-start gap-4 lg:flex">
        {/* minmax(0,…) / min-w-0: texto longo numa linha não pode empurrar o painel para fora do cartão. */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {itens.map(item => (
              <li key={idDe(item)}>
                <button
                  type="button"
                  onClick={() => escolher(item)}
                  aria-current={desktop && selecionado ? idDe(item) === idDe(selecionado) : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left hover:bg-muted/50',
                    borda?.(item) ?? 'border-l-transparent',
                    selecionado && idDe(item) === idDe(selecionado) && 'lg:bg-muted',
                  )}
                >
                  {linha(item)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {selecionado && (
          <PainelLateral key={idDe(selecionado)} legenda={`${tituloDetalhe} · ${descricaoDetalhe(selecionado)}`} onFechar={() => setSelId(null)}>
            {detalhe(selecionado)}
          </PainelLateral>
        )}
      </div>

      <Dialog open={!desktop && aberto && !!selecionado} onOpenChange={setAberto}>
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
              <DialogDescription className="truncate text-xs">{selecionado && descricaoDetalhe(selecionado)}</DialogDescription>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted md:block">
              <X className="size-5" />
            </button>
          </div>
          {selecionado && <div key={idDe(selecionado)} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{detalhe(selecionado)}</div>}
        </DialogContent>
      </Dialog>
    </>
  )
}
