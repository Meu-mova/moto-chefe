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

type Props = { pedidoId: string; chassi: string; modelo: string; origens: OrigemParaEscolher[] }

export function EfetivarDialog({ pedidoId, chassi, modelo, origens }: Props) {
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
    setClienteCpf(cpfCnpj ?? '')
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
      await efetivarVendaAction(
        pedidoId, clienteNome, clienteCpf, valor, formaPagamento, clienteId ?? undefined,
        origemId, origemDetalhe.trim() || undefined,
      )
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const podeEfetivar = !!clienteNome && !!clienteCpf && !!valor && !!formaPagamento
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
              <Label>Nome do Cliente</Label>
              <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>CPF do Cliente</Label>
              <Input value={clienteCpf} onChange={e => setClienteCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <CurrencyInput value={valor} onChange={setValor} placeholder="0,00" />
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
