'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Ticket } from 'lucide-react'
import { hojeBrt } from '@/lib/data-venda'
import { validadePadrao } from '@/lib/cupom-revisao'
import { emitirCupomAction } from '../actions'

type Props = {
  lojas: { id: string; nome: string }[]
  lojaUsuarioId: string | null
  isAdmin: boolean
}

export function EmitirCupomDialog({ lojas, lojaUsuarioId, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const [lojaId, setLojaId] = useState(isAdmin ? '' : (lojaUsuarioId ?? ''))
  const [clienteNome, setClienteNome] = useState('')
  const [chassi, setChassi] = useState('')
  const [validoAte, setValidoAte] = useState(() => validadePadrao(hojeBrt()))
  const [observacao, setObservacao] = useState('')
  const [emitido, setEmitido] = useState<string | null>(null)

  function reset() {
    setLojaId(isAdmin ? '' : (lojaUsuarioId ?? ''))
    setClienteNome('')
    setChassi('')
    setValidoAte(validadePadrao(hojeBrt()))
    setObservacao('')
    setEmitido(null)
  }

  const podeSalvar = !!lojaId && !!validoAte && (clienteNome.trim().length > 0 || chassi.trim().length > 0)

  function salvar() {
    start(async () => {
      try {
        const novo = await emitirCupomAction({
          lojaId,
          clienteNome: clienteNome.trim() || undefined,
          chassi: chassi.trim() || undefined,
          validoAte,
          observacao: observacao.trim() || undefined,
        })
        // O código só existe depois de gravado, e é ele que vai escrito no papel
        // entregue ao cliente. Fechar o dialog direto perderia o número.
        setEmitido(novo.codigo)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao emitir cupom')
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Ticket size={15} /> Emitir cupom
      </Button>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Emitir cupom de revisão gratuita</DialogTitle></DialogHeader>

          {emitido ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Cupom emitido. Anote o código no comprovante do cliente:</p>
              <p className="text-3xl font-mono font-bold text-center bg-muted border rounded-lg py-4 tracking-widest">
                {emitido}
              </p>
              <p className="text-xs text-muted-foreground">
                Vale em qualquer loja do grupo, até {validoAte.slice(8, 10)}/{validoAte.slice(5, 7)}/{validoAte.slice(0, 4)}.
                Cobre a mão de obra da OS; peças e óleo continuam sendo cobrados.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-1 text-sm">
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Loja emissora *</Label>
                  <select
                    value={lojaId}
                    onChange={e => setLojaId(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-card"
                  >
                    <option value="">Selecione…</option>
                    {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome de quem recebe o cupom" />
              </div>

              <div className="space-y-1.5">
                <Label>Chassi da moto (opcional)</Label>
                <Input
                  value={chassi}
                  onChange={e => setChassi(e.target.value.toUpperCase())}
                  placeholder="Precisa existir no estoque"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Válido até *</Label>
                <Input type="date" value={validoAte} onChange={e => setValidoAte(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Ex.: brinde da venda #2311"
                />
              </div>

              {!podeSalvar && (
                <p className="text-xs text-warning">
                  Informe ao menos o cliente ou o chassi — sem isso o cupom não identifica de quem é.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {emitido ? (
              <>
                <Button variant="outline" onClick={() => { setEmitido(null); setClienteNome(''); setChassi(''); setObservacao('') }}>
                  Emitir outro
                </Button>
                <Button onClick={() => { setOpen(false); reset() }}>Fechar</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setOpen(false); reset() }}>Cancelar</Button>
                <Button onClick={salvar} disabled={pending || !podeSalvar}>
                  {pending ? 'Emitindo…' : 'Emitir cupom'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
