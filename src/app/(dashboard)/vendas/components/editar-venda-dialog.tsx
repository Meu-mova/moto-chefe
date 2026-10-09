'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { editarVendaAction } from '../actions'
import { OrigemVendaSelect, origemPreenchida } from '@/components/origem-venda-select'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import { DocumentoClienteInput, RepresentanteLegalCampos, TipoPessoaEtiqueta, tipoPessoaDoCampo } from '@/components/documento-cliente'

type Pgto = {
  id:          string
  tipo:        string
  valor:       string
  operadora?:  string
  parcelas?:   string
  autorizacao?:string
}

function gerarId() { return Math.random().toString(36).slice(2) }

function pgtoFromSchema(p: { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }): Pgto {
  return {
    id:          gerarId(),
    tipo:        p.tipo,
    valor:       p.valor.toFixed(2).replace('.', ','),
    operadora:   p.operadora,
    parcelas:    p.parcelas ? String(p.parcelas) : undefined,
    autorizacao: p.autorizacao,
  }
}

function parseBRL(v: string): number {
  if (!v) return 0
  // Se contém vírgula, está no formato pt-BR (ex: "10.950,00" ou "10950,00")
  if (v.includes(',')) {
    return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Caso contrário já está em decimal com ponto (retorno do CurrencyInput via toFixed)
  return parseFloat(v) || 0
}

type Props = {
  venda: VendaComDetalhes
  papel: string
  vendedores: { id: string; nome: string }[]
  origens: OrigemParaEscolher[]
}

const TIPOS_CARTAO  = new Set(['cartao_credito', 'cartao_debito'])
const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência Bancária',
}

export function EditarVendaDialog({ venda: v, vendedores, origens }: Props) {
  const [open, setOpen] = useState(false)

  // Venda
  const [valor,      setValor]      = useState(Number(v.valor).toFixed(2).replace('.', ','))
  const [dataVenda,  setDataVenda]  = useState(new Date(v.dataVenda).toISOString().split('T')[0])
  const [nf,         setNf]         = useState(v.notaFiscalSaida ?? '')
  const [vendedorId, setVendedorId] = useState(v.vendedorId)
  const [origemId,   setOrigemId]   = useState(v.origemId ?? '')
  const [origemDetalhe, setOrigemDetalhe] = useState(v.origemDetalhe ?? '')

  // Pagamentos
  const pgtosSrc = (v.pagamentos as { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }[] | null) ?? []
  const [pgtos, setPgtos] = useState<Pgto[]>(pgtosSrc.length ? pgtosSrc.map(pgtoFromSchema) : [
    { id: gerarId(), tipo: v.formaPagamento ?? '', valor: Number(v.valor).toFixed(2).replace('.', ',') }
  ])

  // Cliente
  const [clienteNome, setClienteNome] = useState(v.clienteNome)
  const [clienteCpf,  setClienteCpf]  = useState(v.clienteCpf)
  const [celular,     setCelular]     = useState(v.clienteCelular ?? '')
  const [email,       setEmail]       = useState(v.clienteEmail ?? '')
  const [cep,         setCep]         = useState(v.clienteCep ?? '')
  const [logradouro,  setLogradouro]  = useState(v.clienteLogradouro ?? '')
  const [numero,      setNumero]      = useState(v.clienteNumero ?? '')
  const [complemento, setComplemento] = useState(v.clienteComplemento ?? '')
  const [bairro,      setBairro]      = useState(v.clienteBairro ?? '')
  const [cidade,      setCidade]      = useState(v.clienteCidade ?? '')
  const [estado,      setEstado]      = useState(v.clienteEstado ?? '')
  const [representanteNome, setRepresentanteNome] = useState(v.representanteNome ?? '')
  const [representanteCpf,  setRepresentanteCpf]  = useState(v.representanteCpf ?? '')
  const juridica = tipoPessoaDoCampo(clienteCpf) === 'juridica'

  const [pending, startTransition] = useTransition()

  function updatePgto(id: string, field: keyof Pgto, val: string) {
    setPgtos(prev => prev.map(p => p.id !== id ? p : {
      ...p,
      [field]: val,
      ...(field === 'tipo' ? { operadora: undefined, parcelas: undefined, autorizacao: undefined } : {}),
    }))
  }

  function addPgto() {
    setPgtos(prev => [...prev, { id: gerarId(), tipo: 'pix', valor: '' }])
  }

  function removePgto(id: string) {
    setPgtos(prev => prev.filter(p => p.id !== id))
  }

  function handleSalvar() {
    if (!clienteNome.trim() || !clienteCpf.trim() || !valor) {
      toast.error('Preencha nome, CPF/CNPJ e valor')
      return
    }
    // Venda antiga pode não ter origem; se mexeram no campo, tem de ficar válido.
    if (origemId && !origemPreenchida(origens, origemId, origemDetalhe)) {
      toast.error('Essa origem exige detalhe (quem indicou, qual evento, etc)')
      return
    }
    startTransition(async () => {
      try {
        await editarVendaAction(v.id, {
          valor:              parseBRL(valor).toFixed(2),
          dataVenda,
          notaFiscalSaida:    nf.trim() || null,
          vendedorId,
          pagamentos:         pgtos.map(p => ({
            tipo:        p.tipo,
            valor:       parseBRL(p.valor),
            ...(p.operadora    ? { operadora: p.operadora }     : {}),
            ...(p.parcelas     ? { parcelas: parseInt(p.parcelas, 10) } : {}),
            ...(p.autorizacao?.trim() ? { autorizacao: p.autorizacao.trim().toUpperCase() } : {}),
          })),
          clienteNome:        clienteNome.trim(),
          clienteCpf:         clienteCpf.trim(),
          clienteCelular:     celular.trim() || null,
          clienteEmail:       email.trim() || null,
          clienteCep:         cep.trim() || null,
          clienteLogradouro:  logradouro.trim() || null,
          clienteNumero:      numero.trim() || null,
          clienteComplemento: complemento.trim() || null,
          clienteBairro:      bairro.trim() || null,
          clienteCidade:      cidade.trim() || null,
          clienteEstado:      estado.trim() || null,
          // Pessoa física não manda: o servidor limpa o representante sozinho.
          ...(juridica ? { representanteNome, representanteCpf } : {}),
          ...(origemId ? { origemId, origemDetalhe: origemDetalhe.trim() || null } : {}),
        })
        toast.success('Venda atualizada')
        setOpen(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Editar venda"
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
      >
        <Pencil size={15} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Venda #{v.numero}</DialogTitle>
            <p className="text-sm text-slate-500">{v.marca} {v.modelo} — {v.chassi}</p>
          </DialogHeader>

          <div className="space-y-6 text-sm">
            {/* ── Venda ── */}
            <div className="space-y-3">
              <p className="font-semibold text-slate-700 text-base">Dados da Venda</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor Total (R$)</Label>
                  <Input
                    value={valor}
                    onChange={e => {
                      setValor(e.target.value)
                      setPgtos(prev => prev.length === 1 ? [{ ...prev[0], valor: e.target.value }] : prev)
                    }}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data da Venda</Label>
                  <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>NF de Saída</Label>
                  {v.notaFiscalSaida ? (
                    <Input value={nf} onChange={e => setNf(e.target.value)} placeholder="Número da NF" />
                  ) : (
                    <p className="text-xs text-slate-400 pt-1.5">Use o botão de NF para emitir</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor</Label>
                <Select value={vendedorId} onValueChange={v => { if (v) setVendedorId(v) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o vendedor">
                      {(val: string | null) => {
                        if (!val) return undefined
                        const found = vendedores.find(vd => vd.id === val)
                        if (found) return found.nome
                        if (val === v.vendedorId) return v.vendedorNome ?? val
                        return val
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.map(vend => (
                      <SelectItem key={vend.id} value={vend.id}>{vend.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Origem — corrigível aqui; venda antiga entra sem nenhuma. */}
              <OrigemVendaSelect
                origens={origens}
                origemId={origemId}
                onOrigemChange={setOrigemId}
                detalhe={origemDetalhe}
                onDetalheChange={setOrigemDetalhe}
              />
            </div>

            {/* ── Pagamentos ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700 text-base">Pagamentos</p>
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
                          <SelectValue />
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
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Operadora" /></SelectTrigger>
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
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Qtd" /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 21 }, (_, i) => i + 1).map(n => (
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

            {/* ── Cliente ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-700 text-base">Dados do Cliente</p>
                <TipoPessoaEtiqueta documento={clienteCpf} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>{juridica ? 'Razão social' : 'Nome'}</Label>
                  <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF/CNPJ</Label>
                  <DocumentoClienteInput value={clienteCpf} onChange={setClienteCpf} />
                </div>
                <div className="space-y-1.5">
                  <Label>Celular</Label>
                  <Input value={celular} onChange={e => setCelular(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                {juridica && (
                  <RepresentanteLegalCampos
                    nome={representanteNome}
                    cpf={representanteCpf}
                    onNomeChange={setRepresentanteNome}
                    onCpfChange={setRepresentanteCpf}
                  />
                )}
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <Input value={cep} onChange={e => setCep(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input value={bairro} onChange={e => setBairro(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Logradouro</Label>
                  <Input value={logradouro} onChange={e => setLogradouro(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={numero} onChange={e => setNumero(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Complemento</Label>
                  <Input value={complemento} onChange={e => setComplemento(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={cidade} onChange={e => setCidade(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado (UF)</Label>
                  <Input value={estado} onChange={e => setEstado(e.target.value)} maxLength={2} className="uppercase" />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
