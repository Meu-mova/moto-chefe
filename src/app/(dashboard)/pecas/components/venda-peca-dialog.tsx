'use client'

import { cnpjValido, soDigitosDoc } from '@/lib/documento'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Pencil, Plus, Trash2, ShoppingCart } from 'lucide-react'
import { carregarVendaPecaParaEdicaoAction, editarVendaPecaAction, registrarVendaPecaAction } from '../actions'
import { PecaLookup } from './peca-lookup'

type Peca = { id: string; nome: string; valor: string; quantidadeEstoque: number }
type Loja = { id: string; nome: string }

/** `valor` vazio = usa o preço do catálogo; preenchido = preço ajustado pelo gestor. */
type ItemLinha = { id: string; pecaId: string; quantidade: string; valor: string }
type Pgto = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string }

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito'])
// Peça entregue sem cobrança (brinde da moto, cortesia, garantia): a venda existe e
// baixa estoque, mas fecha em R$ 0,00. O servidor zera o valor de qualquer jeito —
// ver zerarBonificacoes em ../actions.ts.
const TIPO_BONIFICACAO = 'bonificacao'
const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  bonificacao: 'Bonificação (sem cobrança)',
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
  /** Gestor pode sobrepor o preço do catálogo naquela venda. O servidor revalida. */
  podeDefinirPreco: boolean
  /**
   * Edição de venda já salva (#242): mesmo diálogo, só itens e pagamentos.
   * Loja e cliente ficam como estão.
   */
  edicao?: { vendaId: string; numero: number }
}

export function VendaPecaDialog({ pecas, lojas, lojaUsuarioId, isAdmin, podeDefinirPreco, edicao }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [carregando, setCarregando] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])

  const [lojaId, setLojaId] = useState(isAdmin ? '' : (lojaUsuarioId ?? ''))
  const [clienteNome, setClienteNome] = useState('')
  // Venda para empresa: muda o rótulo do nome (razão social) e passa a exigir CNPJ.
  const [tipoPessoa, setTipoPessoa] = useState('fisica')
  const [documento, setDocumento] = useState('')
  const [itens, setItens] = useState<ItemLinha[]>([{ id: gerarId(), pecaId: '', quantidade: '1', valor: '' }])
  const [pgtos, setPgtos] = useState<Pgto[]>([{ id: gerarId(), tipo: 'pix', valor: '' }])
  // Peça cadastrada aqui dentro precisa aparecer na busca das outras linhas antes do
  // revalidatePath chegar com a lista nova do servidor.
  const [pecasNovas, setPecasNovas] = useState<Peca[]>([])

  const pecasDisponiveis = useMemo(
    () => (pecasNovas.length === 0 ? pecas : [...pecas, ...pecasNovas]),
    [pecas, pecasNovas],
  )
  const pecaById = useMemo(() => new Map(pecasDisponiveis.map(p => [p.id, p])), [pecasDisponiveis])

  /** Preço que vale na linha: o ajustado, se houver; senão o do catálogo. */
  function precoLinha(item: ItemLinha): number {
    if (item.valor.trim()) return parseBRL(item.valor)
    const peca = pecaById.get(item.pecaId)
    return peca ? parseFloat(peca.valor) : 0
  }

  const totalItens = itens.reduce((s, i) => s + precoLinha(i) * (parseFloat(i.quantidade) || 0), 0)

  function addItem() {
    setItens(prev => [...prev, { id: gerarId(), pecaId: '', quantidade: '1', valor: '' }])
  }
  function updateItem(id: string, campo: keyof ItemLinha, valor: string) {
    setItens(prev => prev.map(i => i.id !== id ? i : { ...i, [campo]: valor }))
  }
  function selecionarPeca(id: string, peca: Peca | null) {
    // Trocar a peça zera o preço ajustado — senão o valor da anterior gruda na nova.
    setItens(prev => prev.map(i => i.id !== id ? i : { ...i, pecaId: peca?.id ?? '', valor: '' }))
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
      // Trocar para bonificação zera o valor digitado: senão o campo fica desabilitado
      // mostrando um número que não vai ser gravado.
      ...(campo === 'tipo' ? { operadora: undefined, parcelas: undefined, autorizacao: undefined } : {}),
      ...(campo === 'tipo' && valor === TIPO_BONIFICACAO ? { valor: '' } : {}),
    }))
  }
  function removePgto(id: string) {
    setPgtos(prev => prev.filter(p => p.id !== id))
  }

  function resetForm() {
    setLojaId(isAdmin ? '' : (lojaUsuarioId ?? ''))
    setClienteNome('')
    setTipoPessoa('fisica')
    setDocumento('')
    setItens([{ id: gerarId(), pecaId: '', quantidade: '1', valor: '' }])
    setPgtos([{ id: gerarId(), tipo: 'pix', valor: '' }])
    // `pecasNovas` não é limpo de propósito: a peça continua cadastrada no banco e
    // a próxima venda tem que achá-la mesmo antes do refresh da página.
  }

  const itensValidos = itens.filter(i => i.pecaId && parseFloat(i.quantidade) > 0)
  // Bonificação é a única forma que vale com R$ 0,00 — é justamente o ponto dela.
  const pgtosValidos = pgtos.filter(p => p.tipo && (p.tipo === TIPO_BONIFICACAO || parseBRL(p.valor) > 0))
  const totalPgtos = pgtosValidos.reduce((s, p) => s + (p.tipo === TIPO_BONIFICACAO ? 0 : parseBRL(p.valor)), 0)
  // Espelha validarDocumento do servidor só pra desabilitar o botão — a trava de
  // verdade está em registrarVendaPecaAction.
  const digitosDoc = soDigitosDoc(documento)
  const clientePJOk = tipoPessoa !== 'juridica' || (cnpjValido(digitosDoc) && clienteNome.trim().length > 0)
  const podeSalvar = edicao
    ? !carregando && itensValidos.length > 0 && pgtosValidos.length > 0
    : !!lojaId && itensValidos.length > 0 && pgtosValidos.length > 0 && clientePJOk

  const itensParaEnviar = () => itensValidos.map(i => ({
    pecaId: i.pecaId,
    quantidade: parseFloat(i.quantidade),
    ...(podeDefinirPreco && i.valor.trim() ? { valorUnitario: parseBRL(i.valor) } : {}),
  }))
  const pgtosParaEnviar = () => pgtosValidos.map(p => ({
    tipo: p.tipo,
    valor: p.tipo === TIPO_BONIFICACAO ? 0 : parseBRL(p.valor),
    ...(p.operadora ? { operadora: p.operadora } : {}),
    ...(p.parcelas ? { parcelas: parseInt(p.parcelas, 10) } : {}),
    ...(p.autorizacao?.trim() ? { autorizacao: p.autorizacao.trim().toUpperCase() } : {}),
  }))

  function abrirEdicao() {
    if (!edicao) return
    setOpen(true)
    setCarregando(true)
    startTransition(async () => {
      try {
        const v = await carregarVendaPecaParaEdicaoAction(edicao.vendaId)
        setClienteNome(v.clienteNome ?? '')
        setPecasNovas(prev => [...prev, ...v.pecas.filter(p => !pecas.some(x => x.id === p.id))])
        // O preço gravado vai na linha: é ele que vale, não o do catálogo de hoje.
        setItens(v.itens.map(i => ({ id: gerarId(), pecaId: i.pecaId, quantidade: String(i.quantidade), valor: i.valorUnitario.toFixed(2).replace('.', ',') })))
        setPgtos(v.pagamentos.map(p => ({
          id: gerarId(), tipo: p.tipo, valor: p.valor.toFixed(2).replace('.', ','),
          operadora: p.operadora, parcelas: p.parcelas ? String(p.parcelas) : undefined, autorizacao: p.autorizacao,
        })))
        setAvisos(v.avisos)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao abrir a venda')
        setOpen(false)
      } finally {
        setCarregando(false)
      }
    })
  }

  function handleSalvarEdicao() {
    if (!edicao) return
    startTransition(async () => {
      try {
        const r = await editarVendaPecaAction(edicao.vendaId, { itens: itensParaEnviar(), pagamentos: pgtosParaEnviar() })
        toast.success(r.aguardandoAprovacao
          ? `Edição da venda #${edicao.numero} enviada para aprovação (financiamento)`
          : `Venda #${edicao.numero} atualizada`)
        setOpen(false)
        resetForm()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar a edição')
      }
    })
  }

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
          clienteTipoPessoa: tipoPessoa,
          clienteDocumento: digitosDoc || null,
          itens: itensParaEnviar(),
          pagamentos: pgtosParaEnviar(),
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
      {edicao ? (
        <Button variant="outline" onClick={abrirEdicao} className="h-10 flex-1 gap-1.5">
          <Pencil className="size-4" /> Editar
        </Button>
      ) : (
        <Button className="h-10 w-full gap-2 lg:h-9 lg:w-auto" onClick={() => setOpen(true)}>
          <ShoppingCart className="size-4" /> Nova venda
        </Button>
      )}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { resetForm(); setAvisos([]) } }}>
        <DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{edicao ? `Editar venda de peças #${edicao.numero}` : 'Nova Venda de Peças e Acessórios'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            {edicao && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {carregando ? 'Carregando…' : `Cliente: ${clienteNome || 'não informado'}. A loja não muda; o cliente se corrige pelo botão "Cliente".`}
                </p>
                {avisos.map(a => (
                  <p key={a} className="border-l-2 border-warning pl-3 text-foreground">{a}</p>
                ))}
              </div>
            )}
            {!edicao && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <Label>Tipo de cliente</Label>
                {/* <select> nativo: o Select do base-ui mostra o value cru quando ele
                    não é o rótulo exibido. */}
                <select
                  value={tipoPessoa}
                  onChange={e => setTipoPessoa(e.target.value)}
                  className="h-9 w-full border border-input rounded-md px-2 text-sm bg-background"
                >
                  <option value="fisica">Pessoa física</option>
                  <option value="juridica">Empresa (CNPJ)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{tipoPessoa === 'juridica' ? 'Razão social *' : 'Cliente (opcional)'}</Label>
                <Input
                  value={clienteNome}
                  onChange={e => setClienteNome(e.target.value)}
                  placeholder={tipoPessoa === 'juridica' ? 'Razão social da empresa' : 'Nome do cliente'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tipoPessoa === 'juridica' ? 'CNPJ *' : 'CPF (opcional)'}</Label>
                <Input
                  value={documento}
                  onChange={e => setDocumento(e.target.value)}
                  placeholder={tipoPessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                  className="font-mono"
                />
                {tipoPessoa === 'juridica' && !clientePJOk && (
                  <p className="text-xs text-warning">Venda para empresa exige razão social e CNPJ válido.</p>
                )}
              </div>
            </div>
            )}

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">Itens</p>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
                  <Plus size={12} /> Adicionar item
                </Button>
              </div>
              {itens.map(item => {
                const peca = pecaById.get(item.pecaId) ?? null
                const qtd = parseFloat(item.quantidade) || 0
                const preco = precoLinha(item)
                const subtotal = preco * qtd
                const estoqueInsuficiente = peca && qtd > peca.quantidadeEstoque
                const precoAjustado = Boolean(peca && item.valor.trim() && Math.abs(preco - parseFloat(peca.valor)) > 0.005)
                return (
                  <div key={item.id} className="space-y-2 rounded-lg border border-border bg-muted p-3">
                    {/* Celular: a peça ocupa a linha e preço/quantidade vão embaixo; do sm para cima, uma linha só. */}
                    <div className={`grid items-end gap-2 ${podeDefinirPreco ? 'grid-cols-[1fr_5rem_auto] sm:grid-cols-[1fr_110px_80px_auto]' : 'grid-cols-[1fr_auto] sm:grid-cols-[1fr_100px_auto]'}`}>
                      <div className={`min-w-0 space-y-1 ${podeDefinirPreco ? 'col-span-3' : 'col-span-2'} sm:col-span-1`}>
                        <Label className="text-xs">Peça / Capacete</Label>
                        <PecaLookup
                          pecas={pecasDisponiveis}
                          selecionada={peca}
                          onSelecionar={p => selecionarPeca(item.id, p)}
                          onPecaCriada={p => setPecasNovas(prev => [...prev, p])}
                        />
                      </div>
                      {podeDefinirPreco && (
                        <div className="space-y-1">
                          <Label className="text-xs">Valor unit.</Label>
                          <CurrencyInput
                            value={item.valor}
                            onChange={v => updateItem(item.id, 'valor', v)}
                            placeholder={peca ? parseFloat(peca.valor).toFixed(2).replace('.', ',') : '0,00'}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
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
                        <button type="button" onClick={() => removeItem(item.id)} aria-label="Remover item" className="p-2 text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    {peca && (
                      <p className={`text-xs ${estoqueInsuficiente ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        Subtotal: {fmtBRL(subtotal)}
                        {precoAjustado ? ` — preço ajustado (catálogo: ${fmtBRL(parseFloat(peca.valor))})` : ''}
                        {estoqueInsuficiente ? ` — estoque insuficiente (disponível: ${peca.quantidadeEstoque})` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
              <p className="text-right font-semibold text-foreground">Total: {fmtBRL(totalItens)}</p>
            </div>

            {/* Pagamentos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">Pagamentos</p>
                <Button variant="outline" size="sm" onClick={addPgto} className="h-7 text-xs gap-1">
                  <Plus size={12} /> Adicionar
                </Button>
              </div>
              {pgtos.map((p, idx) => (
                <div key={p.id} className="space-y-2 rounded-lg border border-border bg-muted p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Pagamento {idx + 1}</span>
                    {pgtos.length > 1 && (
                      <button type="button" onClick={() => removePgto(p.id)} aria-label="Remover pagamento" className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
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
                      <Input
                        value={p.tipo === TIPO_BONIFICACAO ? '0,00' : p.valor}
                        onChange={e => updatePgto(p.id, 'valor', e.target.value)}
                        disabled={p.tipo === TIPO_BONIFICACAO}
                        className="h-8 text-xs disabled:bg-muted disabled:text-muted-foreground"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  {p.tipo === TIPO_BONIFICACAO && (
                    <p className="text-xs text-warning">
                      Entrega sem cobrança — a venda é registrada com valor R$ 0,00 e não entra na receita.
                    </p>
                  )}
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
              <p className="text-right text-sm text-muted-foreground">
                Valor a registrar na venda: <span className="font-semibold text-foreground">{fmtBRL(totalPgtos)}</span>
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); setAvisos([]) }}>Cancelar</Button>
            <Button onClick={edicao ? handleSalvarEdicao : handleSalvar} disabled={pending || !podeSalvar}>
              {edicao ? (pending ? 'Salvando…' : 'Salvar alterações') : (pending ? 'Registrando…' : 'Registrar Venda')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
