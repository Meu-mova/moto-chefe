'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Search, ShoppingCart, CalendarClock } from 'lucide-react'
import { registrarVendaCompletaAction, registrarReservaAction } from '../../vendas/actions'

const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'link_pagamento', label: 'Link de Pagamento' },
  { value: 'transferencia', label: 'Transferência Bancária' },
]

const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone', label: 'Stone' },
  { value: 'pagueveloz', label: 'PagueVeloz' },
]

function validarCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += +d[i] * (10 - i)
  let r = sum % 11
  const dig1 = r < 2 ? 0 : 11 - r
  if (dig1 !== +d[9]) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += +d[i] * (11 - i)
  r = sum % 11
  const dig2 = r < 2 ? 0 : 11 - r
  return dig2 === +d[10]
}

type Pgto = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string }

type Usuario = { id: string; nome: string }

type DadosReservaAtiva = {
  valorEntrada: string
  valorTotal: string
  clienteNome: string
  clienteCpf: string
  clienteCelular: string
  clienteEmail: string
  clienteCep: string
  clienteLogradouro: string
  clienteNumero: string
  clienteComplemento: string
  clienteBairro: string
  clienteCidade: string
  clienteEstado: string
  vendedorId: string
}

type Props = {
  motoId: string
  descricao: string
  vendedorId: string
  vendedorNome: string
  usuarios: Usuario[]
  soReserva?: boolean
  reservaAtiva?: DadosReservaAtiva
  showLabel?: boolean
}

export function VenderButton({ motoId, descricao, vendedorId, vendedorNome, usuarios, soReserva, reservaAtiva, showLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<'venda' | 'reserva'>(soReserva ? 'reserva' : 'venda')
  const [loading, setLoading] = useState(false)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedorId)

  // ── Dados do cliente ──
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCpf, setClienteCpf] = useState('')
  const [clienteCelular, setClienteCelular] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteCep, setClienteCep] = useState('')
  const [clienteLogradouro, setClienteLogradouro] = useState('')
  const [clienteNumero, setClienteNumero] = useState('')
  const [clienteComplemento, setClienteComplemento] = useState('')
  const [clienteBairro, setClienteBairro] = useState('')
  const [clienteCidade, setClienteCidade] = useState('')
  const [clienteEstado, setClienteEstado] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)

  // ── Venda ──
  const [valorVenda, setValorVenda] = useState('')
  const [pgtos, setPgtos] = useState<Pgto[]>([{ id: '1', tipo: '', valor: '' }])

  // ── Reserva ──
  const [valorReserva, setValorReserva] = useState('')
  const [valorTotalVenda, setValorTotalVenda] = useState('')
  const [meioPgto, setMeioPgto] = useState('')
  const [meioPgtoOperadora, setMeioPgtoOperadora] = useState('')
  const [meioPgtoParcelas, setMeioPgtoParcelas] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')

  function resetForm(tipoInicial: 'venda' | 'reserva') {
    setTipo(reservaAtiva ? 'venda' : tipoInicial)
    if (reservaAtiva) {
      setClienteNome(reservaAtiva.clienteNome)
      setClienteCpf(reservaAtiva.clienteCpf)
      setClienteCelular(reservaAtiva.clienteCelular)
      setClienteEmail(reservaAtiva.clienteEmail)
      setClienteCep(reservaAtiva.clienteCep)
      setClienteLogradouro(reservaAtiva.clienteLogradouro)
      setClienteNumero(reservaAtiva.clienteNumero)
      setClienteComplemento(reservaAtiva.clienteComplemento)
      setClienteBairro(reservaAtiva.clienteBairro)
      setClienteCidade(reservaAtiva.clienteCidade)
      setClienteEstado(reservaAtiva.clienteEstado)
      const restante = (parseFloat(reservaAtiva.valorTotal) - parseFloat(reservaAtiva.valorEntrada)).toFixed(2)
      setValorVenda(restante)
      setVendedorSelecionado(reservaAtiva.vendedorId)
    } else {
      setClienteNome(''); setClienteCpf(''); setClienteCelular(''); setClienteEmail('')
      setClienteCep(''); setClienteLogradouro(''); setClienteNumero(''); setClienteComplemento('')
      setClienteBairro(''); setClienteCidade(''); setClienteEstado('')
      setValorVenda('')
      setVendedorSelecionado(vendedorId)
    }
    setPgtos([{ id: '1', tipo: '', valor: '' }])
    setValorReserva(''); setValorTotalVenda(''); setMeioPgto(''); setMeioPgtoOperadora(''); setMeioPgtoParcelas(''); setDataPrevista('')
  }

  function abrir(tipoInicial: 'venda' | 'reserva') {
    resetForm(tipoInicial)
    setOpen(true)
  }

  // ── Máscaras ──
  function handleCpf(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    setClienteCpf(d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1})/, '$1.$2.$3-$4'))
  }

  function handleCelular(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    setClienteCelular(d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2'))
  }

  function handleCep(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8)
    setClienteCep(d.replace(/(\d{5})(\d{1,3})$/, '$1-$2'))
  }

  async function buscarCep() {
    const cep = clienteCep.replace(/\D/g, '')
    if (cep.length !== 8) { toast.error('CEP deve ter 8 dígitos'); return }
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (data.erro) { toast.error('CEP não encontrado'); return }
      setClienteLogradouro(data.logradouro ?? '')
      setClienteBairro(data.bairro ?? '')
      setClienteCidade(data.localidade ?? '')
      setClienteEstado(data.uf ?? '')
      setClienteNumero('')
      setClienteComplemento('')
    } catch {
      toast.error('Erro ao buscar CEP')
    } finally {
      setBuscandoCep(false)
    }
  }

  const addPgto = () =>
    setPgtos(p => [...p, { id: Date.now().toString(), tipo: '', valor: '' }])
  const removePgto = (id: string) =>
    setPgtos(p => p.filter(x => x.id !== id))
  const updatePgto = (id: string, field: keyof Pgto, val: string) =>
    setPgtos(p => p.map(x => x.id === id
      ? { ...x, [field]: val, ...(field === 'tipo' ? { operadora: undefined, parcelas: undefined } : {}) }
      : x
    ))

  const cpfDigits = clienteCpf.replace(/\D/g, '')
  const cpfCompleto = cpfDigits.length === 11
  const cpfValido = cpfCompleto && validarCpf(cpfDigits)
  const valorNum = parseFloat(valorVenda) || 0
  const somatorio = pgtos.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0)
  const somatorioOk = valorNum > 0 && Math.abs(somatorio - valorNum) < 0.01
  const cartaoIncompleto = pgtos.some(p => p.tipo === 'cartao_credito' && (!p.operadora || !p.parcelas))
  const clientePreenchido = !!(clienteNome && cpfValido && clienteCelular && clienteEmail)
  const reservaCartaoIncompleto = meioPgto === 'cartao_credito' && (!meioPgtoOperadora || !meioPgtoParcelas)

  const vendaValida = clientePreenchido && (
    tipo === 'venda'
      ? !!(valorVenda && somatorioOk && pgtos.every(p => p.tipo && p.valor) && !cartaoIncompleto)
      : !!(valorReserva && valorTotalVenda && meioPgto && dataPrevista && !reservaCartaoIncompleto)
  )

  async function handleSubmit() {
    if (!vendaValida) return
    setLoading(true)
    try {
      const clienteBase = {
        clienteNome, clienteCpf, clienteCelular, clienteEmail,
        clienteCep: clienteCep.replace(/\D/g, ''),
        clienteLogradouro, clienteNumero, clienteComplemento,
        clienteBairro, clienteCidade, clienteEstado,
      }

      if (tipo === 'venda') {
        await registrarVendaCompletaAction({
          motoId, ...clienteBase, valorTotal: valorVenda,
          vendedorId: vendedorSelecionado,
          pagamentos: pgtos.map(p => ({
            tipo: p.tipo, valor: parseFloat(p.valor),
            ...(p.tipo === 'cartao_credito' ? { operadora: p.operadora, parcelas: parseInt(p.parcelas!) } : {}),
          })),
        })
        toast.success('Venda registrada com sucesso!')
      } else {
        await registrarReservaAction({
          motoId, ...clienteBase, valorReserva, valorTotalVenda, meioPagamento: meioPgto,
          vendedorId: vendedorSelecionado,
          ...(meioPgto === 'cartao_credito' ? {
            cartaoOperadora: meioPgtoOperadora,
            cartaoParcelas: parseInt(meioPgtoParcelas),
          } : {}),
          dataPrevistaFinalizacao: dataPrevista,
        })
        toast.success('Reserva registrada com sucesso!')
      }
      setOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!soReserva && (
        <Button
          variant={showLabel ? 'outline' : 'ghost'}
          size={showLabel ? 'sm' : 'icon'}
          title={reservaAtiva ? 'Finalizar Venda (Reservada)' : 'Registrar Venda'}
          onClick={() => abrir('venda')}
          className={showLabel
            ? 'h-8 gap-1.5 text-xs border-green-300 text-green-600 hover:bg-green-50'
            : 'h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50'}
        >
          <ShoppingCart size={showLabel ? 14 : 16} />
          {showLabel && (reservaAtiva ? 'Finalizar Venda' : 'Vender')}
        </Button>
      )}
      {soReserva && (
        <Button
          variant={showLabel ? 'outline' : 'ghost'}
          size={showLabel ? 'sm' : 'icon'}
          title="Registrar Reserva"
          onClick={() => abrir('reserva')}
          className={showLabel
            ? 'h-8 gap-1.5 text-xs border-blue-300 text-blue-600 hover:bg-blue-50'
            : 'h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50'}
        >
          <CalendarClock size={showLabel ? 14 : 16} />
          {showLabel && 'Reservar'}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>
                  {tipo === 'venda' ? 'Registrar Venda' : 'Registrar Reserva'}
                </DialogTitle>
                <p className="text-sm text-slate-500 mt-0.5">{descricao}</p>
              </div>
              {!soReserva && !reservaAtiva && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={tipo === 'venda' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTipo('venda')}
                  >
                    Venda
                  </Button>
                  <Button
                    type="button"
                    variant={tipo === 'reserva' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTipo('reserva')}
                  >
                    Reserva
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Vendedor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vendedor</Label>
                <Select value={vendedorSelecionado} onValueChange={v => setVendedorSelecionado(v ?? vendedorId)}>
                  <SelectTrigger className="w-full">
                    {usuarios.find(u => u.id === vendedorSelecionado)?.nome ?? 'Selecionar vendedor'}
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {reservaAtiva && (
              <div className="text-sm px-3 py-2 rounded-md border bg-blue-50 text-blue-700 border-blue-200">
                <p className="font-medium">Moto reservada</p>
                <p>Entrada paga: R$ {parseFloat(reservaAtiva.valorEntrada).toFixed(2).replace('.', ',')}</p>
                <p>Valor total acordado: R$ {parseFloat(reservaAtiva.valorTotal).toFixed(2).replace('.', ',')}</p>
                <p>Restante a cobrar: R$ {(parseFloat(reservaAtiva.valorTotal) - parseFloat(reservaAtiva.valorEntrada)).toFixed(2).replace('.', ',')}</p>
              </div>
            )}

            <div className="h-px bg-slate-200" />

            {/* ── Dados do cliente ── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Dados do Cliente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Nome completo <span className="text-red-500">*</span></Label>
                  <Input
                    value={clienteNome}
                    onChange={e => setClienteNome(e.target.value)}
                    placeholder="Nome completo do cliente"
                  />
                </div>

                <div className="space-y-1">
                  <Label>CPF <span className="text-red-500">*</span></Label>
                  <Input
                    value={clienteCpf}
                    onChange={e => handleCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className={cpfCompleto && !cpfValido ? 'border-red-400 focus-visible:ring-red-400' : ''}
                  />
                  {cpfCompleto && !cpfValido && <p className="text-xs text-red-500">CPF inválido</p>}
                  {cpfValido && <p className="text-xs text-green-600">✓ CPF válido</p>}
                </div>

                <div className="space-y-1">
                  <Label>Celular <span className="text-red-500">*</span></Label>
                  <Input
                    value={clienteCelular}
                    onChange={e => handleCelular(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>E-mail <span className="text-red-500">*</span></Label>
                  <Input
                    type="email"
                    value={clienteEmail}
                    onChange={e => setClienteEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>

                <div className="space-y-1">
                  <Label>CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      value={clienteCep}
                      onChange={e => handleCep(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && buscarCep()}
                      placeholder="00000-000"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={buscarCep}
                      disabled={buscandoCep}
                      title="Buscar CEP"
                    >
                      <Search size={14} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Input
                    value={clienteEstado}
                    onChange={e => setClienteEstado(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>Logradouro</Label>
                  <Input
                    value={clienteLogradouro}
                    onChange={e => setClienteLogradouro(e.target.value)}
                    placeholder="Rua, Avenida..."
                  />
                </div>

                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input
                    value={clienteNumero}
                    onChange={e => setClienteNumero(e.target.value)}
                    placeholder="123"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Complemento</Label>
                  <Input
                    value={clienteComplemento}
                    onChange={e => setClienteComplemento(e.target.value)}
                    placeholder="Apto, Bloco, Sala..."
                  />
                </div>

                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input
                    value={clienteBairro}
                    onChange={e => setClienteBairro(e.target.value)}
                    placeholder="Bairro"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input
                    value={clienteCidade}
                    onChange={e => setClienteCidade(e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {tipo === 'venda' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Pagamento</p>

                <div className="space-y-1">
                  <Label>Valor da Venda (R$) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={valorVenda}
                    onChange={e => setValorVenda(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Formas de Pagamento <span className="text-red-500">*</span></Label>
                  {pgtos.map(p => (
                    <div key={p.id} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <Select value={p.tipo} onValueChange={v => updatePgto(p.id, 'tipo', v ?? '')}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Forma de pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {FORMAS.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" step="0.01" min="0"
                          className="w-32"
                          placeholder="R$ 0.00"
                          value={p.valor}
                          onChange={e => updatePgto(p.id, 'valor', e.target.value)}
                        />
                        {pgtos.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removePgto(p.id)}>
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                      {p.tipo === 'cartao_credito' && (
                        <div className="flex gap-2">
                          <Select value={p.operadora ?? ''} onValueChange={v => updatePgto(p.id, 'operadora', v ?? '')}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Operadora" />
                            </SelectTrigger>
                            <SelectContent>
                              {OPERADORAS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={p.parcelas ?? ''} onValueChange={v => updatePgto(p.id, 'parcelas', v ?? '')}>
                            <SelectTrigger className="w-28">
                              <SelectValue placeholder="Parcelas" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 21 }, (_, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addPgto}>
                    <Plus size={14} /> Adicionar forma
                  </Button>
                </div>

                {valorNum > 0 && (
                  <div className={`text-sm px-3 py-2 rounded-md border ${
                    somatorioOk
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {somatorioOk
                      ? `✓ Somatório confere: R$ ${somatorio.toFixed(2).replace('.', ',')}`
                      : `Somatório R$ ${somatorio.toFixed(2).replace('.', ',')} ≠ Valor R$ ${valorNum.toFixed(2).replace('.', ',')}`
                    }
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Dados da Reserva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Valor da Entrada (R$) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={valorReserva}
                      onChange={e => setValorReserva(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Valor Total da Venda (R$) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={valorTotalVenda}
                      onChange={e => setValorTotalVenda(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Meio de Pagamento <span className="text-red-500">*</span></Label>
                  <Select value={meioPgto} onValueChange={v => { setMeioPgto(v ?? ''); setMeioPgtoOperadora(''); setMeioPgtoParcelas('') }}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {FORMAS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {meioPgto === 'cartao_credito' && (
                    <div className="flex gap-2 mt-2">
                      <Select value={meioPgtoOperadora} onValueChange={v => setMeioPgtoOperadora(v ?? '')}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Operadora" />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERADORAS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={meioPgtoParcelas} onValueChange={v => setMeioPgtoParcelas(v ?? '')}>
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="Parcelas" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 21 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Data Prevista de Finalização <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={dataPrevista}
                    onChange={e => setDataPrevista(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading || !vendaValida}>
              {loading
                ? 'Salvando...'
                : tipo === 'venda' ? 'Confirmar Venda' : 'Confirmar Reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
