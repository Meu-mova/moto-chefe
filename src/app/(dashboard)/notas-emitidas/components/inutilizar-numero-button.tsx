'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN } from '@/lib/notagateway/inutilizacao'
import { pedirInutilizacaoAction } from '../actions'

/**
 * Pede a inutilização do número da nota recusada (#597). Sem confirmação digitada (decisão do
 * Luis): a nota já foi escolhida na lista, e o diálogo mostra número, série e ambiente em destaque.
 */
export function InutilizarNumeroButton({ nota, ambiente }: {
  nota: { id: string; numero: string | null; serie: string | null }
  ambiente: 'Producao' | 'Homologacao'
}) {
  const [aberto, setAberto] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const producao = ambiente === 'Producao'
  const tamanho = justificativa.trim().length

  async function confirmar() {
    setEnviando(true)
    setErro(null)
    const r = await pedirInutilizacaoAction(nota.id, justificativa)
    setEnviando(false)
    if (!r.ok) { setErro(r.erro); return }
    toast.success(`Pedido de inutilização do número ${nota.numero} enviado`)
    setAberto(false)
  }

  return (
    <>
      <button type="button" className="text-xs font-medium text-destructive underline-offset-4 hover:underline"
        onClick={() => { setJustificativa(''); setErro(null); setAberto(true) }}>
        Inutilizar número
      </button>
      <Dialog open={aberto} onOpenChange={v => { if (!enviando) setAberto(v) }} disablePointerDismissal>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inutilizar número da nota</DialogTitle>
            <DialogDescription>
              O número fica registrado na SEFAZ como não usado, e a numeração deixa de ter buraco.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted p-3 text-center">
            <div><dt className="text-xs text-muted-foreground">Número</dt><dd className="text-lg font-bold tabular-nums">{nota.numero}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Série</dt><dd className="text-lg font-bold tabular-nums">{nota.serie}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Ambiente</dt><dd className="text-lg font-bold">{producao ? 'Produção' : 'Teste (homologação)'}</dd></div>
          </dl>

          {producao ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Na produção, a inutilização não tem volta. O número não pode mais ser usado em nenhuma nota.
            </p>
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Teste (homologação): sem valor fiscal.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="justificativa-inutilizacao">Justificativa</Label>
            <Textarea id="justificativa-inutilizacao" value={justificativa} maxLength={JUSTIFICATIVA_MAX} rows={3}
              placeholder="Ex.: venda cancelada depois da rejeicao da nota" onChange={e => setJustificativa(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              De {JUSTIFICATIVA_MIN} a {JUSTIFICATIVA_MAX} caracteres. Os acentos saem sozinhos. ({tamanho})
            </p>
          </div>

          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={enviando || tamanho < JUSTIFICATIVA_MIN} onClick={confirmar}>
              {enviando && <Loader2 className="animate-spin" />}
              Inutilizar o número {nota.numero}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
