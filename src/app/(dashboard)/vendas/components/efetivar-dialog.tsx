'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buscarPrecoMinimoAction, efetivarVendaAction } from '../actions'
import { OrigemVendaSelect, origemPreenchida } from '@/components/origem-venda-select'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import { ClienteBusca } from '@/app/(dashboard)/clientes/components/cliente-busca'
import { lerDocumentoCliente, mascararCpfCnpj, tipoPessoaSeCompleto } from '@/lib/documento'
import { DocumentoClienteInput } from '@/components/documento-cliente'
import { textoDaModalidade } from '@/lib/notagateway/transporte'
import { enderecoDaEntregaEmLinha, freteDaVenda, textoDaEntrega, totalComFrete, type EntregaVenda } from '@/lib/notagateway/entrega'
import { brl } from '@/lib/dashboard-painel'
import { aprovacaoNecessaria, motivoDaAprovacao, temPagamentoSensivel } from '@/lib/aprovacao-venda'
import { liquidoDaMoto, type TaxasVenda } from '@/lib/preco-minimo'

type Props = {
  pedidoId: string; motoId: string; chassi: string; modelo: string; origens: OrigemParaEscolher[]
  papel: string
  /** Quem tem a permissão efetiva transferência direto; os demais pedem aprovação (#776). */
  podeAprovarSensivel: boolean
  /** Vem do pedido e vai para a venda no servidor; aqui só se confere ("Alterar" é do #727). */
  entrega: EntregaVenda | null
}

function EntregaDoPedido({ entrega }: { entrega: EntregaVenda | null }) {
  return (
    <section aria-label="Entrega do pedido" className="space-y-1 rounded-lg border border-border bg-muted p-3 text-sm">
      {!entrega ? <p className="text-muted-foreground">Pedido sem a Entrega informada.</p> : (
        <>
          <p className="font-medium">{textoDaEntrega(entrega)} (do pedido)</p>
          {entrega.modo === 'entregar' && (
            <>
              <p className="text-muted-foreground">{enderecoDaEntregaEmLinha(entrega.endereco)}</p>
              <p className="text-muted-foreground">Quem recebe: {entrega.recebe?.nome ?? 'o comprador'}</p>
              {freteDaVenda(entrega) > 0 && <p className="text-muted-foreground">Frete cobrado: {brl(freteDaVenda(entrega))}</p>}
            </>
          )}
          <p className="text-muted-foreground">Modalidade: {textoDaModalidade(entrega.modalidade) ?? 'não escolhida'}</p>
        </>
      )}
    </section>
  )
}

export function EfetivarDialog({ pedidoId, motoId, chassi, modelo, origens, entrega, papel, podeAprovarSensivel }: Props) {
  const [open, setOpen] = useState(false)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<{ id: string; nome: string } | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCpf, setClienteCpf] = useState('')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [loading, setLoading] = useState(false)
  const [origemId, setOrigemId] = useState('')
  const [origemDetalhe, setOrigemDetalhe] = useState('')
  const [motivo, setMotivo] = useState('')
  const [preco, setPreco] = useState<{ minimo: number; taxas: TaxasVenda } | null>(null)

  // Precificação do modelo da moto, a mesma que o servidor confere (#776).
  useEffect(() => {
    if (!open) return
    let vivo = true
    buscarPrecoMinimoAction(motoId).then(info => { if (vivo) setPreco(info && { minimo: info.valorMinimoPix, taxas: info.taxas }) })
    return () => { vivo = false }
  }, [open, motoId])

  function handleClienteSelect(id: string, nome: string, cpfCnpj: string | null) {
    setClienteId(id)
    setClienteSelecionado({ id, nome })
    setClienteNome(nome)
    setClienteCpf(mascararCpfCnpj(cpfCnpj ?? ''))
  }

  function handleClienteClear() {
    setClienteId(null)
    setClienteSelecionado(null)
    setClienteNome('')
    setClienteCpf('')
  }

  async function handleEfetivar() {
    if (!podeEfetivar) return
    setLoading(true)
    try {
      const r = await efetivarVendaAction(
        pedidoId, clienteNome, clienteCpf, valor, pagamentos, clienteId ?? undefined,
        origemId, origemDetalhe.trim() || undefined, motivo.trim() || undefined,
      )
      if (!r.ok) { toast.error(r.erro); return }
      if (r.dados) toast.success('Pedido enviado para aprovação')
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const frete = freteDaVenda(entrega)
  const juridica = tipoPessoaSeCompleto(clienteCpf) === 'juridica'
  // Uma forma só nesta tela; a lista de formas chega com a tela nova (#784). O total inclui o frete do pedido.
  const pagamentos = formaPagamento ? [{ tipo: formaPagamento, valor: totalComFrete(Number(valor) || 0, frete) }] : []
  const liquido = preco && valor ? liquidoDaMoto(pagamentos, preco.taxas, frete) : null
  const aprovacao = aprovacaoNecessaria({
    sensivelSemPermissao: temPagamentoSensivel(pagamentos) && !podeAprovarSensivel,
    preco: preco && liquido !== null ? { liquido, minimo: preco.minimo } : null,
    papel,
  })
  const podeEfetivar = !!clienteNome && lerDocumentoCliente(clienteCpf).ok && !!valor && !!formaPagamento
    && origemPreenchida(origens, origemId, origemDetalhe) && (!aprovacao || !!motivoDaAprovacao(aprovacao, motivo))

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Efetivar Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Efetivar Venda — {modelo} ({chassi})</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente (opcional — busque pelo nome ou CPF/CNPJ)</Label>
              <ClienteBusca
                onSelect={handleClienteSelect}
                clienteSelecionado={clienteSelecionado}
                onClear={handleClienteClear}
              />
            </div>
            <div className="space-y-2">
              <Label>{juridica ? 'Razão social' : 'Nome do Cliente'}</Label>
              <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder={juridica ? 'Razão social da empresa' : 'Nome completo'} />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ do Cliente</Label>
              <DocumentoClienteInput value={clienteCpf} onChange={setClienteCpf} />
            </div>
            <EntregaDoPedido entrega={entrega} />
            <div className="space-y-2">
              <Label>{frete ? 'Valor da moto (R$)' : 'Valor (R$)'}</Label>
              <CurrencyInput value={valor} onChange={setValor} placeholder="0,00" />
              {/* O servidor soma o frete do pedido ao valor: aqui só se mostra o total. */}
              {frete > 0 && <p className="text-sm font-medium">Total (moto + frete): {brl(totalComFrete(Number(valor) || 0, frete))}</p>}
            </div>
            <OrigemVendaSelect
              origens={origens}
              origemId={origemId}
              onOrigemChange={setOrigemId}
              detalhe={origemDetalhe}
              onDetalheChange={setOrigemDetalhe}
            />
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={v => setFormaPagamento(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="financiamento">Financiamento</SelectItem>
                  <SelectItem value="transferencia">Transferência bancária</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {aprovacao && (
              <div className="space-y-2">
                <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  {aprovacao === 'valor_minimo' && preco && liquido !== null
                    ? `Abaixo do preço mínimo: líquido da moto ${brl(liquido)}, mínimo ${brl(preco.minimo)}. O pedido vai para aprovação.`
                    : 'Transferência bancária precisa de aprovação. O pedido vai para aprovação.'}
                </p>
                <Label htmlFor="efetivar-motivo">
                  {aprovacao === 'valor_minimo' ? 'Motivo do pedido de aprovação' : 'Motivo do pedido de aprovação (opcional)'}
                </Label>
                <Textarea id="efetivar-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEfetivar}
              disabled={loading || !podeEfetivar}
            >
              {loading ? 'Enviando...' : aprovacao ? 'Pedir aprovação' : 'Confirmar Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
