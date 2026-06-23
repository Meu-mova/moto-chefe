'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Search, ShoppingCart, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { registrarVendaCompletaAction, registrarReservaAction, buscarPrecoMinimoAction } from '../../vendas/actions'
import { calcLiquidoRecebido, validarReserva, fmtBRL, type TaxasVenda } from '@/lib/preco-minimo'

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

// Tipos com taxa aplicada sobre parcelas
const TIPOS_COM_PARCELAS = new Set(['cartao_credito', 'link_pagamento', 'financiamento'])

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
  meioPagamento: string
  cartaoOperadora?: string | null
  cartaoParcelas?: string | null
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
  precoMinimoPix?: number | null
  taxasVenda?: TaxasVenda | null
}

function parcelasDisponiveis(tipo: string, taxas: TaxasVenda | null): number[] {
  if (!taxas) return []
  if (tipo === 'cartao_credito') {
    return Array.from({ length: 21 }, (_, i) => i + 1)
  }
  if (tipo === 'link_pagamento') {
    return Object.entries(taxas.taxasLink)
      .filter(([, t]) => t > 0)
      .map(([k]) => parseInt(k))
      .sort((a, b) => a - b)
  }
  if (tipo === 'financiamento') {
    return Object.entries(taxas.taxasFinanciamento)
      .filter(([, t]) => t > 0)
      .map(([k]) => parseInt(k))
      .sort((a, b) => a - b)
  }
  return []
}

export function VenderButton({ motoId, descricao, vendedorId, vendedorNome, usuarios, soReserva, reservaAtiva, showLabel, precoMinimoPix: precoMinimoPixProp, taxasVenda: taxasVendaProp }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<'venda' | 'reserva'>(soReserva ? 'reserva' : 'venda')
  const [loading, setLoading] = useState(false)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedorId)

  // Dados de precificação — podem vir via props (detalhe) ou buscados ao abrir (lista)
  const [precoMinimoPix, setPrecoMinimoPix] = useState<number | null>(precoMinimoPixProp ?? null)
  const [taxasVenda, setTaxasVenda] = useState<TaxasVenda | null>(taxasVendaProp ?? null)

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
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().split('T')[0])
  const [pgtos, setPgtos] = useState<Pgto[]>([{ id: '1', tipo: '', valor: '' }])

  // Quando o total da venda muda numa finalização de reserva, atualiza o restante automaticamente
  useEffect(() => {
    if (!reservaAtiva) return
    const total = parseFloat(valorVenda) || 0
    const entrada = parseFloat(reservaAtiva.valorEntrada) || 0
    const restante = Math.max(0, total - entrada).toFixed(2)
    setPgtos(prev => prev.map(p => p.id === 'restante' ? { ...p, valor: restante } : p))
  }, [valorVenda]) // eslint-disable-line react-hooks/exhaustive-deps

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
      setValorVenda(reservaAtiva.valorTotal)
      const restante = (parseFloat(reservaAtiva.valorTotal) - parseFloat(reservaAtiva.valorEntrada)).toFixed(2)
      setPgtos([
        {
          id: 'entrada',
          tipo: reservaAtiva.meioPagamento,
          valor: reservaAtiva.valorEntrada,
          operadora: reservaAtiva.cartaoOperadora ?? undefined,
          parcelas: reservaAtiva.cartaoParcelas ?? undefined,
        },
        { id: 'restante', tipo: '', valor: restante },
      ])
      setVendedorSelecionado(reservaAtiva.vendedorId)
    } else {
      setClienteNome(''); setClienteCpf(''); setClienteCelular(''); setClienteEmail('')
      setClienteCep(''); setClienteLogradouro(''); setClienteNumero(''); setClienteComplemento('')
      setClienteBairro(''); setClienteCidade(''); setClienteEstado('')
      setValorVenda('')
      setVendedorSelecionado(vendedorId)
      setPgtos([{ id: '1', tipo: '', valor: '' }])
    }
    setDataVenda(new Date().toISOString().split('T')[0])
    setValorReserva(''); setValorTotalVenda(''); setMeioPgto(''); setMeioPgtoOperadora(''); setMeioPgtoParcelas(''); setDataPrevista('')
  }

  async function abrir(tipoInicial: 'venda' | 'reserva') {
    resetForm(tipoInicial)
    setOpen(true)
    // Busca dados de precificação se não vieram via props (ex: aberto da listagem)
    if (!precoMinimoPixProp) {
      const info = await buscarPrecoMinimoAction(motoId)
      if (info) {
        setPrecoMinimoPix(info.valorMinimoPix)
        setTaxasVenda(info.taxas)
      }
    }
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

  // ── Validações de venda ──
  const cpfDigits = clienteCpf.replace(/\D/g, '')
  const cpfCompleto = cpfDigits.length === 11
  const cpfValido = cpfCompleto && validarCpf(cpfDigits)
  const valorNum = parseFloat(valorVenda) || 0
  const somatorio = pgtos.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0)
  const somatorioOk = valorNum > 0 && Math.abs(somatorio - valorNum) < 0.01
  const cartaoIncompleto = pgtos.some(p =>
    (p.tipo === 'cartao_credito' && (!p.operadora || !p.parcelas)) ||
    (TIPOS_COM_PARCELAS.has(p.tipo) && p.tipo !== 'cartao_credito' && taxasVenda && parcelasDisponiveis(p.tipo, taxasVenda).length > 0 && !p.parcelas)
  )
  const clientePreenchido = !!(clienteNome && cpfValido && clienteCelular && clienteEmail)
  const reservaCartaoIncompleto = meioPgto === 'cartao_credito' && (!meioPgtoOperadora || !meioPgtoParcelas)

  // ── Validação de preço mínimo (venda) ──
  const pgtoCalc = pgtos
    .filter(p => p.tipo && p.valor)
    .map(p => ({
      tipo: p.tipo,
      valor: parseFloat(p.valor) || 0,
      parcelas: p.parcelas ? parseInt(p.parcelas) : undefined,
    }))
  const liquidoEstimado = taxasVenda && pgtoCalc.length > 0
    ? calcLiquidoRecebido(pgtoCalc, taxasVenda)
    : null
  const liquidoOk = !precoMinimoPix || liquidoEstimado === null || liquidoEstimado >= precoMinimoPix - 0.01
  const todosPgtosComParcelas = pgtos.filter(p => TIPOS_COM_PARCELAS.has(p.tipo)).every(p => !!p.parcelas)

  // ── Validação de preço mínimo (reserva) ──
  const valorReservaNum = parseFloat(valorReserva) || 0
  const valorTotalNum = parseFloat(valorTotalVenda) || 0
  const reservaValidacao = precoMinimoPix
    ? validarReserva(valorReservaNum, valorTotalNum, precoMinimoPix)
    : null

  const vendaValida = clientePreenchido && (
    tipo === 'venda'
      ? !!(valorVenda && somatorioOk && pgtos.every(p => p.tipo && p.valor) && !cartaoIncompleto && liquidoOk)
      : !!(valorReserva && valorTotalVenda && meioPgto && dataPrevista && !reservaCartaoIncompleto
          && (reservaValidacao ? reservaValidacao.entradaOk : true))
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
          dataVenda: dataVenda || undefined,
          pagamentos: pgtos.map(p => ({
            tipo: p.tipo, valor: parseFloat(p.valor),
            ...(p.tipo === 'cartao_credito' ? { operadora: p.operadora, parcelas: parseInt(p.parcelas!) } : {}),
            ...(TIPOS_COM_PARCELAS.has(p.tipo) && p.tipo !== 'cartao_credito' && p.parcelas ? { parcelas: parseInt(p.parcelas) } : {}),
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
          dataReserva: dataVenda || undefined,
        })
        toast.success('Reserva registrada com sucesso!')
      }
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar')
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
                  {reservaAtiva ? 'Finalizar Venda' : tipo === 'venda' ? 'Registrar Venda' : 'Registrar Reserva'}
                </DialogTitle>
                <p className="text-sm text-slate-500 mt-0.5">{descricao}</p>
              </div>
              {!soReserva && !reservaAtiva && (
                <div className="flex gap-2">
                  <Button type="button" variant={tipo === 'venda' ? 'default' : 'outline'} size="sm" onClick={() => setTipo('venda')}>
                    Venda
                  </Button>
                  <Button type="button" variant={tipo === 'reserva' ? 'default' : 'outline'} size="sm" onClick={() => setTipo('reserva')}>
                    Reserva
                  </Button>
                </div>
              )}
            </div>

            {/* Banner de preço mínimo */}
            {precoMinimoPix && (
              <div className="mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-slate-600">
                <span className="font-medium">Preço mínimo PIX:</span>
                <span className="font-semibold text-slate-800">{fmtBRL(precoMinimoPix)}</span>
                {tipo === 'reserva' && (
                  <span className="ml-2 text-slate-400">· Entrada mínima: <strong className="text-slate-700">{fmtBRL(precoMinimoPix * 0.3)}</strong> (30%)</span>
                )}
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Vendedor + Data */}
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
              <div className="space-y-1">
                <Label>{tipo === 'venda' ? 'Data da Venda' : 'Data da Reserva'}</Label>
                <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} />
              </div>
            </div>

            {reservaAtiva && (
              <div className="text-sm px-3 py-2 rounded-md border bg-blue-50 text-blue-700 border-blue-200 space-y-0.5">
                <p className="font-medium">Resumo da reserva</p>
                <p>Total negociado: <span className="font-semibold">{fmtBRL(parseFloat(valorVenda) || 0)}</span>
                  {valorVenda !== reservaAtiva.valorTotal && (
                    <span className="ml-1 text-xs text-blue-500">(reservado: {fmtBRL(parseFloat(reservaAtiva.valorTotal))})</span>
                  )}
                </p>
                <p>Entrada já recebida: <span className="font-semibold">{fmtBRL(parseFloat(reservaAtiva.valorEntrada))}</span></p>
                <p>Restante a receber: <span className="font-semibold">{fmtBRL(Math.max(0, (parseFloat(valorVenda) || 0) - parseFloat(reservaAtiva.valorEntrada)))}</span></p>
              </div>
            )}

            <div className="h-px bg-slate-200" />

            {/* ── Dados do cliente ── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Dados do Cliente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Nome completo <span className="text-red-500">*</span></Label>
                  <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo do cliente" />
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
                  <Input value={clienteCelular} onChange={e => handleCelular(e.target.value)} placeholder="(00) 00000-0000" />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>E-mail <span className="text-red-500">*</span></Label>
                  <Input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="email@exemplo.com" />
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
                    <Button type="button" variant="outline" size="icon" onClick={buscarCep} disabled={buscandoCep} title="Buscar CEP">
                      <Search size={14} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Input value={clienteEstado} onChange={e => setClienteEstado(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>Logradouro</Label>
                  <Input value={clienteLogradouro} onChange={e => setClienteLogradouro(e.target.value)} placeholder="Rua, Avenida..." />
                </div>

                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input value={clienteNumero} onChange={e => setClienteNumero(e.target.value)} placeholder="123" />
                </div>

                <div className="space-y-1">
                  <Label>Complemento</Label>
                  <Input value={clienteComplemento} onChange={e => setClienteComplemento(e.target.value)} placeholder="Apto, Bloco, Sala..." />
                </div>

                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input value={clienteBairro} onChange={e => setClienteBairro(e.target.value)} placeholder="Bairro" />
                </div>

                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input value={clienteCidade} onChange={e => setClienteCidade(e.target.value)} placeholder="Cidade" />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {tipo === 'venda' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Pagamento</p>

                <div className="space-y-1">
                  <Label>
                    Valor da Venda (R$) <span className="text-red-500">*</span>
                    {reservaAtiva && <span className="text-xs text-slate-400 ml-1">(editável — restante atualiza automaticamente)</span>}
                  </Label>
                  <CurrencyInput
                    value={valorVenda}
                    onChange={setValorVenda}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Formas de Pagamento <span className="text-red-500">*</span></Label>
                  {pgtos.map((p, idx) => {
                    const opcParcelas = taxasVenda ? parcelasDisponiveis(p.tipo, taxasVenda) : []
                    const precisaParcelas = TIPOS_COM_PARCELAS.has(p.tipo) && opcParcelas.length > 0
                    return (
                      <div key={p.id} className="space-y-1">
                        {reservaAtiva && idx === 0 && <p className="text-xs text-slate-500 font-medium">Entrada recebida</p>}
                        {reservaAtiva && idx === 1 && <p className="text-xs text-slate-500 font-medium">Restante a receber</p>}
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
                          <CurrencyInput
                            className="w-32"
                            placeholder="0,00"
                            value={p.valor}
                            onChange={v => updatePgto(p.id, 'valor', v)}
                          />
                          {pgtos.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removePgto(p.id)}>
                              <X size={14} />
                            </Button>
                          )}
                        </div>

                        {/* Cartão de crédito: operadora + parcelas */}
                        {p.tipo === 'cartao_credito' && (
                          <div className="flex gap-2 ml-0">
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

                        {/* Link e Financiamento: apenas parcelas */}
                        {precisaParcelas && p.tipo !== 'cartao_credito' && (
                          <div className="flex gap-2">
                            <Select value={p.parcelas ?? ''} onValueChange={v => updatePgto(p.id, 'parcelas', v ?? '')}>
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder={p.tipo === 'financiamento' ? 'Prazo (meses)' : 'Parcelas'} />
                              </SelectTrigger>
                              <SelectContent>
                                {opcParcelas.map(n => (
                                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addPgto}>
                    <Plus size={14} /> Adicionar forma
                  </Button>
                </div>

                {/* Somatório */}
                {valorNum > 0 && (
                  <div className={`text-sm px-3 py-2 rounded-md border ${
                    somatorioOk ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {somatorioOk
                      ? `✓ Somatório confere: R$ ${somatorio.toFixed(2).replace('.', ',')}`
                      : `Somatório R$ ${somatorio.toFixed(2).replace('.', ',')} ≠ Valor R$ ${valorNum.toFixed(2).replace('.', ',')}`
                    }
                  </div>
                )}

                {/* Validação de preço mínimo */}
                {precoMinimoPix && taxasVenda && somatorioOk && todosPgtosComParcelas && liquidoEstimado !== null && (
                  <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-md border ${
                    liquidoOk
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {liquidoOk
                      ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      : <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    }
                    <div>
                      <p className="font-medium">
                        {liquidoOk ? 'Valor aprovado' : 'Abaixo do preço mínimo'}
                      </p>
                      <p className="text-xs mt-0.5">
                        Líquido estimado: <strong>{fmtBRL(liquidoEstimado)}</strong>
                        {' '}/ Mínimo PIX: <strong>{fmtBRL(precoMinimoPix)}</strong>
                        {!liquidoOk && (
                          <span className="text-red-600"> — faltam {fmtBRL(precoMinimoPix - liquidoEstimado)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── RESERVA ── */
              <div className="space-y-3">
                <p className="text-sm font-semibold">Dados da Reserva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>
                      Valor da Entrada (R$) <span className="text-red-500">*</span>
                      {precoMinimoPix && (
                        <span className="ml-1 text-xs text-slate-400">mín. {fmtBRL(precoMinimoPix * 0.3)}</span>
                      )}
                    </Label>
                    <CurrencyInput
                      value={valorReserva}
                      onChange={setValorReserva}
                      placeholder="0,00"
                      className={
                        valorReservaNum > 0 && reservaValidacao && !reservaValidacao.entradaOk
                          ? 'border-red-400'
                          : ''
                      }
                    />
                    {valorReservaNum > 0 && reservaValidacao && !reservaValidacao.entradaOk && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Mínimo de {fmtBRL(reservaValidacao.minimoEntrada)} (30% do preço PIX)
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Valor Total da Venda (R$) <span className="text-red-500">*</span>
                      {precoMinimoPix && (
                        <span className="ml-1 text-xs text-slate-400">PIX: {fmtBRL(precoMinimoPix)}</span>
                      )}
                    </Label>
                    <CurrencyInput
                      value={valorTotalVenda}
                      onChange={setValorTotalVenda}
                      placeholder="0,00"
                      className={
                        valorTotalNum > 0 && reservaValidacao && !reservaValidacao.totalOk
                          ? 'border-amber-400'
                          : ''
                      }
                    />
                    {valorTotalNum > 0 && reservaValidacao && !reservaValidacao.totalOk && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Abaixo do preço mínimo PIX ({fmtBRL(precoMinimoPix!)}) — confirme se está correto
                      </p>
                    )}
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
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Operadora" /></SelectTrigger>
                        <SelectContent>
                          {OPERADORAS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={meioPgtoParcelas} onValueChange={v => setMeioPgtoParcelas(v ?? '')}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="Parcelas" /></SelectTrigger>
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
                  <Input type="date" value={dataPrevista} onChange={e => setDataPrevista(e.target.value)} />
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
