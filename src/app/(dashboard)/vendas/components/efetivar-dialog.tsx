'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { efetivarVendaAction } from '../actions'
import { OrigemVendaSelect, origemPreenchida } from '@/components/origem-venda-select'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import { ClienteBusca } from '@/app/(dashboard)/clientes/components/cliente-busca'
import { lerDocumentoCliente, mascararCpfCnpj, tipoPessoaSeCompleto } from '@/lib/documento'
import { DocumentoClienteInput } from '@/components/documento-cliente'
import { textoDaModalidade } from '@/lib/notagateway/transporte'
import { enderecoDaEntregaEmLinha, freteDaVenda, textoDaEntrega, type EntregaVenda } from '@/lib/notagateway/entrega'
import { brl } from '@/lib/dashboard-painel'

type Props = {
  pedidoId: string; chassi: string; modelo: string; origens: OrigemParaEscolher[]
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

export function EfetivarDialog({ pedidoId, chassi, modelo, origens, entrega }: Props) {
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
        pedidoId, clienteNome, clienteCpf, valor, formaPagamento, clienteId ?? undefined,
        origemId, origemDetalhe.trim() || undefined,
      )
      if (!r.ok) { toast.error(r.erro); return }
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const frete = freteDaVenda(entrega)
  const juridica = tipoPessoaSeCompleto(clienteCpf) === 'juridica'
  const podeEfetivar = !!clienteNome && lerDocumentoCliente(clienteCpf).ok && !!valor && !!formaPagamento
    && origemPreenchida(origens, origemId, origemDetalhe)

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
              {frete > 0 && <p className="text-sm font-medium">Total (moto + frete): {brl((Number(valor) || 0) + frete)}</p>}
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
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEfetivar}
              disabled={loading || !podeEfetivar}
            >
              {loading ? 'Efetivando...' : 'Confirmar Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
