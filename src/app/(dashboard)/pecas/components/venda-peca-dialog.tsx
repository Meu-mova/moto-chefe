'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { registrarVendaPecaAction } from '../actions'

type Peca = { id: string; nome: string; valor: string; quantidadeEstoque: number }
type Loja = { id: string; nome: string }

type ItemLinha = { id: string; pecaId: string; quantidade: string }
type Pgto = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string }

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
}
const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
  cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
}

function gerarId() { return Math.random().toString(36).slice(2) }

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseBRL(v: string): number {
  if (!v) return 0
  if (v.includes(',')) return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(v) || 0
}

type Props = {
  pecas: Peca[]
  lojas: Loja[]
  lojaUsuarioId: string | null
  isAdmin: boolean
}

export function VendaPecaDialog({ pecas, lojas, lojaUsuarioId, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [lojaId, setLojaId] = useState(isAdmin ? '' : (lojaUsuarioId ?? ''))
  const [clienteNome, setClienteNome] = useState('')
  const [itens, setItens] = useState<ItemLinha[]>([{ id: gerarId(), pecaId: '', quantidade: '1' }])
  const [pgtos, setPgtos] = useState<Pgto[]>([{ id: gerarId(), tipo: 'pix', valor: '' }])

  const pecaById = useMemo(() => new Map(pecas.map(p => [p.id, p])), [pecas])

  const totalItens = itens.reduce((s, i) => {
    const peca = pecaById.get(i.pecaId)
    const qtd = parseFloat(i.quantidade) || 0
    return s + (peca ? parseFloat(peca.valor) * qtd : 0)
  }, 0)

  function addItem() {
    setItens(prev => [...prev, { id: gerarId(), pecaId: '', quantidade: '1' }])
  }
  function updateItem(id: string, campo: keyof ItemLinha, valor: string) {
    setItens(prev => prev.map(i => i.id !== id ? i : { ...i, [campo]: valor }))
  }
  function removeItem(id: string) {
    setItens(prev => prev.filter(i => i.id !== id))
  }

  function addPgto() {
    setPgtos(prev => [...prev, { id: gerarId(), tipo: 'pix', valor: '' }])
  }
  function updatePgto(id: string, campo: keyof Pgto, valor: string) {
    setPgtos(prev => prev.map(p => p.id !== id ? p : {
      ...p,
      [campo]: valor,
      ...(campo === 'tipo' ? { operadora: undefined, parcelas: undefined, autorizacao: undefined } : {}),
    }))
  }
  function removePgto(id: string) {
    setPgtos(prev => prev.filter(p => p.id !== id))
  }

  function resetForm() {
    setLojaId(isAdmin ? '' : (lojaUsuarioId ?? ''))
    setClienteNome('')
    setItens([{ id: gerarId(), pecaId: '', quantidade: '1' }])
    setPgtos([{ id: gerarId(), tipo: 'pix', valor: '' }])
  }

  const itensValidos = itens.filter(i => i.pecaId && parseFloat(i.quantidade) > 0)
  const pgtosValidos = pgtos.filter(p => p.tipo && parseBRL(p.valor) > 0)
  const podeSalvar = !!lojaId && itensValidos.length > 0 && pgtosValidos.length > 0

  function handleSalvar() {
    if (!podeSalvar) {
      toast.error('Preencha loja, ao menos um item e uma forma de pagamento')
      return
    }
    startTransition(async () => {
      try {
        const resultado = await registrarVendaPecaAction({
          lojaId,
          clienteNome: clienteNome.trim() || undefined,
          itens: itensValidos.map(i => ({ pecaId: i.pecaId, quantidade: parseFloat(i.quantidade) })),
          pagamentos: pgtosValidos.map(p => ({
            tipo: p.tipo,
            valor: parseBRL(p.valor),
            ...(p.operadora ? { operadora: p.operadora } : {}),
            ...(p.parcelas ? { parcelas: parseInt(p.parcelas, 10) } : {}),
            ...(p.autorizacao?.trim() ? { autorizacao: p.autorizacao.trim().toUpperCase() } : {}),
          })),
        })
        toast.success(resultado.aguardandoAprovacao
          ? 'Venda com financiamento enviada para aprovação'
          : 'Venda registrada!')
        setOpen(false)
        resetForm()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao registrar venda')
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <ShoppingCart size={15} /> Nova Venda
      </Button>
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Venda de Peças e Acessórios</DialogTitle></DialogHeader>

          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Loja *</Label>
                  <Select value={lojaId} onValueChange={v => setLojaId(v ?? '')}>
                    <SelectTrigger>
                      <span className={lojaId ? 'text-foreground' : 'text-muted-foreground'}>
                        {lojas.find(l => l.id === lojaId)?.nome ?? 'Selecione a loja'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {lojas.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Cliente (opcional)</Label>
                <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Itens</p>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
                  <Plus size={12} /> Adicionar item
                </Button>
              </div>
              {itens.map(item => {
                const peca = pecaById.get(item.pecaId)
                const qtd = parseFloat(item.quantidade) || 0
                const subtotal = peca ? parseFloat(peca.valor) * qtd : 0
                const estoqueInsuficiente = peca && qtd > peca.quantidadeEstoque
                return (
                  <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
                    <div className="grid grid-cols-[1fr_100px_auto] gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Peça / Capacete</Label>
                        <Select value={item.pecaId} onValueChange={v => updateItem(item.id, 'pecaId', v ?? '')}>
                          <SelectTrigger className="h-8 text-xs">
                            <span className={item.pecaId ? 'text-foreground' : 'text-muted-foreground'}>
                              {peca?.nome ?? 'Selecione'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {pecas.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.nome} — {fmtBRL(parseFloat(p.valor))} (estoque: {p.quantidadeEstoque})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qtd</Label>
                        <Input
                          type="number" min="1" step="1"
                          value={item.quantidade}
                          onChange={e => updateItem(item.id, 'quantidade', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      {itens.length > 1 && (
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 pb-1.5">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {peca && (
                      <p className={`text-xs ${estoqueInsuficiente ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                        Subtotal: {fmtBRL(subtotal)}
                        {estoqueInsuficiente ? ` — estoque insuficiente (disponível: ${peca.quantidadeEstoque})` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
              <p className="text-right font-semibold text-slate-700">Total: {fmtBRL(totalItens)}</p>
            </div>

            {/* Pagamentos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Pagamentos</p>
                <Button variant="outline" size="sm" onClick={addPgto} className="h-7 text-xs gap-1">
                  <Plus size={12} /> Adicionar
                </Button>
              </div>
              {pgtos.map((p, idx) => (
                <div key={p.id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Pagamento {idx + 1}</span>
                    {pgtos.length > 1 && (
                      <button onClick={() => removePgto(p.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={p.tipo} onValueChange={v => v && updatePgto(p.id, 'tipo', v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <span>{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_LABEL).map(([k, lbl]) => (
                            <SelectItem key={k} value={k} className="text-xs">{lbl}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input value={p.valor} onChange={e => updatePgto(p.id, 'valor', e.target.value)} className="h-8 text-xs" placeholder="0,00" />
                    </div>
                  </div>
                  {p.tipo === 'cartao_credito' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Operadora</Label>
                        <Select value={p.operadora ?? ''} onValueChange={v => v && updatePgto(p.id, 'operadora', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <span className={p.operadora ? '' : 'text-muted-foreground'}>
                              {OPERADORA_LABEL[p.operadora ?? ''] ?? 'Operadora'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="infinitypay" className="text-xs">InfinityPay</SelectItem>
                            <SelectItem value="stone" className="text-xs">Stone</SelectItem>
                            <SelectItem value="pagueveloz" className="text-xs">PaguéVeloz</SelectItem>
                            <SelectItem value="cielo" className="text-xs">Cielo</SelectItem>
                            <SelectItem value="getnet" className="text-xs">GetNet</SelectItem>
                            <SelectItem value="redecard" className="text-xs">Redecard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Parcelas</Label>
                        <Select value={p.parcelas ?? ''} onValueChange={v => v && updatePgto(p.id, 'parcelas', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <span className={p.parcelas ? '' : 'text-muted-foreground'}>
                              {p.parcelas ? `${p.parcelas}x` : 'Qtd'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                              <SelectItem key={n} value={String(n)} className="text-xs">{n}x</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {(TIPOS_CARTAO.has(p.tipo) || p.tipo === 'link_pagamento') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Autorização (impresso no comprovante)</Label>
                      <Input
                        value={p.autorizacao ?? ''}
                        onChange={e => updatePgto(p.id, 'autorizacao', e.target.value.toUpperCase())}
                        className="h-8 text-xs font-mono"
                        placeholder="Opcional"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={pending || !podeSalvar}>
              {pending ? 'Registrando…' : 'Registrar Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
