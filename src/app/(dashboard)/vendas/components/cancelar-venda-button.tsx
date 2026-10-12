'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, X, XCircle } from 'lucide-react'
import { cancelarVendaCompletaAction } from '../actions'
import { travaDoCancelamentoDaVendaAction } from '../nfe-propria-actions'

type Props = {
  vendaId: string
  descricao: string
  /** Total já conciliado (cartão + PIX). Vira aviso: esse dinheiro será desvinculado. */
  valorRecebido?: number
  notaFiscalSaida?: string | null
  /** Troca o botão padrão por outro (ex.: os botões do painel da venda). */
  gatilho?: (abrir: () => void) => React.ReactNode
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ACONTECE = [
  'A moto volta ao estoque como disponível',
  'O lançamento de caixa da venda é removido',
  'O pedido é cancelado',
  'O registro da venda e os documentos de assinatura são apagados',
]

// Os mais comuns na loja; o texto livre continua para detalhar ou para o que não estiver aqui.
const MOTIVOS = ['Cliente desistiu', 'Financiamento negado', 'Lançada errada', 'Troca de moto']

type Conferencia =
  | { estado: 'conferindo' }
  | { estado: 'livre' }
  | { estado: 'travada'; trava: string }
  | { estado: 'falhou'; erro: string }

export function CancelarVendaButton({ vendaId, descricao, valorRecebido = 0, notaFiscalSaida, gatilho }: Props) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [conferencia, setConferencia] = useState<Conferencia>({ estado: 'conferindo' })

  const temRecebimento = valorRecebido > 0.005
  const detalhe = motivo.trim()
  const motivoFinal = escolhido ? (detalhe ? `${escolhido}: ${detalhe}` : escolhido) : detalhe

  async function abrir() {
    setOpen(true)
    setMotivo('')
    setEscolhido(null)
    setConferencia({ estado: 'conferindo' })
    try {
      const t = await travaDoCancelamentoDaVendaAction(vendaId)
      setConferencia(!t.ok ? { estado: 'falhou', erro: t.error } : t.trava ? { estado: 'travada', trava: t.trava } : { estado: 'livre' })
    } catch {
      setConferencia({ estado: 'falhou', erro: 'sem resposta do servidor' })
    }
  }

  async function handleConfirm() {
    if (!motivoFinal) {
      toast.error('Informe o motivo do cancelamento')
      return
    }
    setLoading(true)
    try {
      const r = await cancelarVendaCompletaAction(vendaId, motivoFinal)
      if (!r.ok) {
        setConferencia(r.travada ? { estado: 'travada', trava: r.error } : { estado: 'falhou', erro: r.error })
        return
      }
      const desvinculados = r.cartao + r.pix
      toast.success(
        desvinculados > 0
          ? `Venda cancelada — ${desvinculados} recebimento(s) desvinculado(s), ${fmt(r.valor)} de volta como não conciliado`
          : 'Venda cancelada com sucesso',
      )
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {gatilho ? gatilho(abrir) : (
      <Button
        variant="ghost"
        size="icon"
        title="Cancelar Venda"
        onClick={abrir}
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
      >
        <XCircle size={16} />
      </Button>
      )}

      <Dialog open={open} onOpenChange={o => !loading && setOpen(o)}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
            <button type="button" onClick={() => setOpen(false)} aria-label="Voltar" className="rounded-md p-2 text-foreground hover:bg-muted sm:hidden">
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">Cancelar venda</DialogTitle>
              <DialogDescription className="truncate text-xs">{descricao}</DialogDescription>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:block">
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {conferencia.estado === 'conferindo' ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Conferindo a NF de saída da venda…
            </p>
          ) : conferencia.estado === 'travada' ? (
            <div className="border-l-4 border-l-destructive pl-3">
              <p className="text-lg font-semibold">Esta venda não pode ser cancelada agora</p>
              <p className="text-sm text-muted-foreground">{conferencia.trava}</p>
            </div>
          ) : conferencia.estado === 'falhou' ? (
            <p className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">
              Não deu para conferir a NF de saída desta venda ({conferencia.erro}). Feche e abra de novo.
            </p>
          ) : (
          <>
            <div>
              <p className="font-medium">Ao cancelar</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {ACONTECE.map(t => (
                  <li key={t} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />{t}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">Não dá para desfazer.</p>
            </div>

            {temRecebimento && (
              <div className="border-l-2 border-l-warning pl-3 text-sm">
                <p className="font-medium">{fmt(valorRecebido)} já foram recebidos e conciliados</p>
                <p className="text-muted-foreground">
                  Os recebimentos voltam como não vinculados em Conciliação e PIX; o dinheiro continua no extrato.
                  A devolução ao cliente é lançada à parte, como saída.
                </p>
              </div>
            )}

            {notaFiscalSaida && (
              <div className="border-l-2 border-l-warning pl-3 text-sm">
                <p className="font-medium">NF de saída {notaFiscalSaida} já emitida</p>
                <p className="text-muted-foreground">Cancelar aqui não cancela a nota na SEFAZ — isso precisa ser feito no Bling.</p>
              </div>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Por que cancelar?</legend>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEscolhido(escolhido === t ? null : t)}
                    aria-pressed={escolhido === t}
                    className={cn(
                      'h-10 rounded-full border px-4 text-sm',
                      escolhido === t ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Label htmlFor="motivo-cancelamento" className="sr-only">Detalhe do motivo</Label>
              <Textarea
                id="motivo-cancelamento"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder={escolhido ? 'Detalhe, se quiser (opcional)' : 'Ou escreva o motivo'}
                rows={3}
                className="mt-3 text-base sm:text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Fica registrado com seu nome e a data.</p>
            </fieldset>
          </>
          )}
          </div>

          {conferencia.estado === 'livre' && (
            <div className="space-y-1 border-t border-border p-3">
              <Button variant="destructive" onClick={handleConfirm} disabled={loading || !motivoFinal} className="h-12 w-full text-base">
                {loading ? 'Cancelando…' : 'Cancelar venda'}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="h-10 w-full text-muted-foreground">
                Manter a venda
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
