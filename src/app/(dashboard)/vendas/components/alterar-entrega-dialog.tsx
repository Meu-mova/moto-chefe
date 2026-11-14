'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { brl } from '@/lib/dashboard-painel'
import { freteDaVenda, type EntregaVenda } from '@/lib/notagateway/entrega'
import { EntregaEModalidade, entregaDoFormulario, FreteCobrado, formularioDaEntrega, quemRecebeInvalido } from './entrega-campos'

type Props = {
  entrega: EntregaVenda | null
  /** Depois da venda o frete cobrado não muda (#895): sem o "+ Frete", só o valor para conferir. */
  freteFixo: boolean
  rotulo: string
  /** A Server Action do pedido ou da venda; a recusa fica no diálogo. */
  salvar: (entrega: EntregaVenda) => Promise<{ ok: true } | { ok: false; erro: string }>
  aoSalvar: (entrega: EntregaVenda) => void
}

/** "Alterar entrega" na efetivação e na prévia da NF: o mesmo bloco do Novo pedido, num diálogo. */
export function AlterarEntregaDialog({ entrega, freteFixo, rotulo, salvar, aoSalvar }: Props) {
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState(() => formularioDaEntrega(entrega))
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const frete = freteDaVenda(entrega)

  function abrir() {
    setForm(formularioDaEntrega(entrega))
    setErro(null)
    setAberto(true)
  }

  async function confirmar() {
    const nova = entregaDoFormulario(form)
    setEnviando(true)
    setErro(null)
    try {
      const r = await salvar(nova)
      if (!r.ok) { setErro(r.erro); return }
      aoSalvar(nova)
      setAberto(false)
    } catch {
      setErro('Não deu para salvar a entrega agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={abrir}>{rotulo}</Button>
      <Dialog open={aberto} onOpenChange={o => { if (!enviando) setAberto(o) }} disablePointerDismissal>
        <DialogContent aria-label="Alterar entrega" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Alterar entrega</DialogTitle></DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            <EntregaEModalidade idModalidade="alterar-modalidade" valor={form} onChange={setForm} />
            {freteFixo
              ? frete > 0 && <p className="text-sm text-muted-foreground">Frete cobrado: {brl(frete)}. Não muda depois da venda.</p>
              : <FreteCobrado id="alterar-frete" valor={form} onChange={setForm} />}
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={enviando} onClick={() => setAberto(false)}>Voltar</Button>
            <Button type="button" disabled={enviando || quemRecebeInvalido(form)} onClick={confirmar}>
              {enviando ? 'Salvando...' : 'Salvar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
