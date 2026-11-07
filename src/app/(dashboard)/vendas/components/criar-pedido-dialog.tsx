'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ModalidadeFreteSelect } from '@/components/modalidade-frete-select'
import { CLASSE_SELECT_NATIVO } from '@/components/ui/select-nativo'
import { criarPedidoVendaAction } from '../actions'
import { podeCriarPedido } from '@/lib/pedido-venda-regras'
import { textoDaModalidade } from '@/lib/notagateway/transporte'
import { AVISO_SEM_MODALIDADE, textoDaEntrega } from '@/lib/notagateway/entrega'
import { EntregaCampos, ENTREGA_DO_FORMULARIO_INICIAL, entregaDoFormulario, quemRecebeInvalido, type EntregaDoFormulario } from './entrega-campos'

type Moto = { id: string; chassi: string; marca: string; modelo: string; cor: string; lojaNome: string }

type Props = { motos: Moto[]; papel: string }

const nomeDaMoto = (m: Moto) => `${m.marca} ${m.modelo}, chassi ${m.chassi} (${m.cor}), ${m.lojaNome}`

/** Novo pedido no layout B da #682: itens à esquerda; Entrega, modalidade e resumo à direita. */
export function CriarPedidoDialog({ motos, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [entrega, setEntrega] = useState<EntregaDoFormulario>(ENTREGA_DO_FORMULARIO_INICIAL)
  const [loading, setLoading] = useState(false)

  async function handleCriar() {
    if (!motoId) return
    setLoading(true)
    try {
      const r = await criarPedidoVendaAction(motoId, observacao, entregaDoFormulario(entrega))
      if (!r.ok) { toast.error(r.erro); return }
      setOpen(false)
      setMotoId('')
      setObservacao('')
      setEntrega(ENTREGA_DO_FORMULARIO_INICIAL)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!podeCriarPedido(papel)) return null

  const moto = motos.find(m => m.id === motoId)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Criar Pedido de Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo pedido de venda</DialogTitle>
            <DialogDescription>{moto ? moto.lojaNome : 'Escolha a moto para ver a loja do pedido.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Itens do pedido</h3>
              <div className="space-y-2">
                <Label htmlFor="pedido-moto">Moto disponível</Label>
                {/* Nativo: o <Select> do design system mostra o UUID quando value ≠ texto,
                    e a lista dele tem a largura do campo, o que cortava o nome da moto. */}
                <select
                  id="pedido-moto"
                  value={motoId}
                  onChange={e => setMotoId(e.target.value)}
                  className={CLASSE_SELECT_NATIVO}
                >
                  <option value="">Selecionar moto</option>
                  {motos.map(m => <option key={m.id} value={m.id}>{nomeDaMoto(m)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedido-observacao">Observação (opcional)</Label>
                <Textarea id="pedido-observacao" value={observacao} onChange={e => setObservacao(e.target.value)} />
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
              <EntregaCampos valor={entrega} onChange={setEntrega} />
              <div className="space-y-2">
                <Label htmlFor="pedido-modalidade">Modalidade do frete na nota</Label>
                <ModalidadeFreteSelect
                  id="pedido-modalidade"
                  valor={entrega.modalidade}
                  onChange={modalidade => setEntrega(anterior => ({ ...anterior, modalidade }))}
                  placeholder="Escolha"
                />
                {!entrega.modalidade && (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">{AVISO_SEM_MODALIDADE}</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Resumo</h3>
                <dl aria-label="Resumo do pedido" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-muted p-3 text-sm">
                  <dt className="text-muted-foreground">Moto</dt>
                  <dd className="text-right">{moto ? `${moto.marca} ${moto.modelo}` : 'Nenhuma'}</dd>
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd className="text-right">{textoDaEntrega(entregaDoFormulario(entrega))}</dd>
                  <dt className="text-muted-foreground">Modalidade</dt>
                  <dd className="text-right">{textoDaModalidade(entrega.modalidade) ?? 'Não escolhida'}</dd>
                </dl>
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="h-11" onClick={handleCriar} disabled={loading || !motoId || quemRecebeInvalido(entrega)}>
              {loading ? 'Criando...' : 'Criar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
