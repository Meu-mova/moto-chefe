'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, CheckCircle2, AlertCircle, Loader2, X, Bike, Archive, UserPlus } from 'lucide-react'
import { buscarVeiculoPorChassisAction, buscarClientePorCpfAction, cadastrarVeiculoHistoricoAction, buscarClienteDaOsAction } from '../buscar-veiculo-action'
import { ClienteForm } from '@/app/(dashboard)/clientes/components/cliente-form'
import type { VeiculoEncontrado } from '../buscar-veiculo-action'

type ClienteInfo = {
  id: string; nome: string; cpfCnpj: string | null; celular: string | null; email: string | null
}

type Props = {
  onVeiculoEncontrado: (v: VeiculoEncontrado | null) => void
  onClienteEncontrado: (c: ClienteInfo | null) => void
  chassiInicial?: string
}

export function ChassiLookup({ onVeiculoEncontrado, onClienteEncontrado, chassiInicial = '' }: Props) {
  const [chassi,     setChassi]     = useState(chassiInicial)
  const [cpf,        setCpf]        = useState('')
  const [resultados, setResultados] = useState<VeiculoEncontrado[]>([])
  const [veiculo,    setVeiculo]    = useState<VeiculoEncontrado | null>(null)
  const [cliente,    setCliente]    = useState<ClienteInfo | null>(null)
  const [erroChassi, setErroChassi] = useState<string | null>(null)
  const [erroCpf,    setErroCpf]    = useState<string | null>(null)
  const [listaAberta, setListaAberta] = useState(false)
  const [pendingC, startC] = useTransition()
  const [pendingV, startV] = useTransition()
  const [cadastrandoVeiculo, setCadastrandoVeiculo] = useState(false)
  const [novoVeiculo, setNovoVeiculo] = useState({ marca: '', modelo: '', cor: '', numeroMotor: '' })
  const [pendingCadastro, startCadastro] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  // Fecha a lista ao clicar fora
  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (listaRef.current && !listaRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setListaAberta(false)
      }
    }
    document.addEventListener('mousedown', onClickFora)
    return () => document.removeEventListener('mousedown', onClickFora)
  }, [])

  function buscar() {
    if (chassi.trim().length < 3) return
    setErroChassi(null); setResultados([]); setListaAberta(false)
    startV(async () => {
      const lista = await buscarVeiculoPorChassisAction(chassi)
      if (lista.length === 1) {
        selecionarVeiculo(lista[0])
      } else if (lista.length > 1) {
        setResultados(lista)
        setListaAberta(true)
      } else {
        setErroChassi('Nenhum veículo encontrado — você pode prosseguir assim mesmo')
      }
    })
  }

  function selecionarVeiculo(v: VeiculoEncontrado) {
    setVeiculo(v)
    setResultados([])
    setListaAberta(false)
    setCadastrandoVeiculo(false)
    onVeiculoEncontrado(v)
    if (v.clienteId && v.clienteNome) {
      const c: ClienteInfo = {
        id: v.clienteId, nome: v.clienteNome!,
        cpfCnpj: v.clienteCpf ?? null, celular: v.clienteFone ?? null, email: null,
      }
      setCliente(c); onClienteEncontrado(c)
      if (v.clienteCpf) setCpf(v.clienteCpf)
    }
  }

  function buscarCpf() {
    if (!cpf.trim()) return
    setErroCpf(null); setCliente(null); onClienteEncontrado(null)
    startC(async () => {
      const c = await buscarClientePorCpfAction(cpf)
      if (c) { setCliente(c); onClienteEncontrado(c) }
      else    { setErroCpf('CPF não encontrado no cadastro') }
    })
  }

  function cadastrarVeiculo() {
    if (!novoVeiculo.marca.trim() || !novoVeiculo.modelo.trim()) {
      setErroChassi('Informe marca e modelo')
      return
    }
    startCadastro(async () => {
      try {
        const v = await cadastrarVeiculoHistoricoAction({
          chassi: chassi,
          marca: novoVeiculo.marca,
          modelo: novoVeiculo.modelo,
          cor: novoVeiculo.cor || null,
          numeroMotor: novoVeiculo.numeroMotor || null,
        })
        selecionarVeiculo(v)
        setCadastrandoVeiculo(false)
        setNovoVeiculo({ marca: '', modelo: '', cor: '', numeroMotor: '' })
      } catch (e: unknown) {
        setErroChassi(e instanceof Error ? e.message : 'Erro ao cadastrar veículo')
      }
    })
  }

  function limparVeiculo() {
    setVeiculo(null); setChassi(''); setErroChassi(null); setResultados([])
    onVeiculoEncontrado(null)
  }
  function limparCliente() {
    setCliente(null); setCpf(''); setErroCpf(null); onClienteEncontrado(null)
  }

  return (
    <div className="space-y-4">
      {/* Busca por chassi */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Chassi do veículo <span className="text-destructive">*</span>
        </label>

        {veiculo ? (
          <VeiculoCard veiculo={veiculo} onLimpar={limparVeiculo} />
        ) : (
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={chassi}
                onChange={e => { setChassi(e.target.value.toUpperCase()); setErroChassi(null) }}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                onFocus={() => resultados.length > 0 && setListaAberta(true)}
                placeholder="Digite parte do chassi (mín. 3 caracteres)…"
                className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring ${
                  erroChassi ? 'border-warning' : 'border-input'
                }`}
              />
              <button
                onClick={buscar}
                disabled={pendingV || chassi.trim().length < 3}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {pendingV ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            </div>

            {/* Dropdown de resultados */}
            {listaAberta && resultados.length > 0 && (
              <div ref={listaRef}
                className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                <p className="px-3 py-2 text-[11px] text-muted-foreground border-b bg-muted">
                  {resultados.length} resultado{resultados.length > 1 ? 's' : ''} — clique para selecionar
                </p>
                <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                  {resultados.map(r => (
                    <li key={r.chassi}>
                      <button
                        type="button"
                        onClick={() => selecionarVeiculo(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-center gap-3"
                      >
                        {r.fonte === 'estoque'
                          ? <Bike size={14} className="text-primary-text shrink-0" />
                          : <Archive size={14} className="text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {r.marca} {r.modelo}
                            {r.cor && <span className="font-normal text-muted-foreground"> · {r.cor}</span>}
                          </p>
                          <p className="text-xs font-mono text-muted-foreground">{r.chassi}</p>
                          {r.clienteNome && (
                            <p className="text-xs text-primary-text">{r.clienteNome}</p>
                          )}
                        </div>
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          r.fonte === 'estoque'
                            ? 'bg-primary-soft text-primary-text'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {r.fonte === 'estoque' ? 'Estoque' : 'Histórico'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erroChassi && !cadastrandoVeiculo && (
              <div className="mt-1 space-y-1.5">
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle size={12} /> {erroChassi}
                </p>
                {chassi.trim().length >= 3 && (
                  <button
                    type="button"
                    onClick={() => { setCadastrandoVeiculo(true); setErroChassi(null) }}
                    className="text-xs text-primary-text hover:underline flex items-center gap-1"
                  >
                    <UserPlus size={12} /> Cadastrar este veículo
                  </button>
                )}
              </div>
            )}

            {cadastrandoVeiculo && (
              <div className="mt-2 border border-input rounded-lg p-3 space-y-2 bg-muted">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cadastrar veículo — chassi {chassi}
                </p>
                {erroChassi && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertCircle size={12} /> {erroChassi}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={novoVeiculo.marca}
                    onChange={e => setNovoVeiculo(v => ({ ...v, marca: e.target.value }))}
                    placeholder="Marca *"
                    className="border border-input rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.modelo}
                    onChange={e => setNovoVeiculo(v => ({ ...v, modelo: e.target.value }))}
                    placeholder="Modelo *"
                    className="border border-input rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.cor}
                    onChange={e => setNovoVeiculo(v => ({ ...v, cor: e.target.value }))}
                    placeholder="Cor"
                    className="border border-input rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    value={novoVeiculo.numeroMotor}
                    onChange={e => setNovoVeiculo(v => ({ ...v, numeroMotor: e.target.value }))}
                    placeholder="Motor"
                    className="border border-input rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cadastrarVeiculo}
                    disabled={pendingCadastro}
                    className="flex-1 bg-primary text-primary-foreground text-xs font-medium rounded-md py-1.5 hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pendingCadastro ? 'Salvando…' : 'Salvar veículo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCadastrandoVeiculo(false)
                      setErroChassi(null)
                      setNovoVeiculo({ marca: '', modelo: '', cor: '', numeroMotor: '' })
                    }}
                    disabled={pendingCadastro}
                    className="text-xs text-muted-foreground hover:text-foreground px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Busca por CPF */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Cliente (busca por CPF)
        </label>
        {cliente ? (
          <ClienteCard cliente={cliente} onLimpar={limparCliente} />
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={cpf}
                onChange={e => { setCpf(e.target.value); setErroCpf(null) }}
                onKeyDown={e => e.key === 'Enter' && buscarCpf()}
                placeholder="000.000.000-00"
                className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                  erroCpf ? 'border-destructive' : 'border-input'
                }`}
              />
              <button
                onClick={buscarCpf}
                disabled={pendingC || cpf.replace(/\D/g, '').length < 11}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {pendingC ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            </div>
            {erroCpf && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle size={12} /> {erroCpf}
                </p>
                <ClienteForm
                  trigger={
                    <span className="text-xs text-primary-text hover:underline flex items-center gap-1 shrink-0">
                      <UserPlus size={12} /> Cadastrar cliente
                    </span>
                  }
                  onCreated={async (id) => {
                    const c = await buscarClienteDaOsAction(id)
                    if (c) {
                      const info = { id: c.id, nome: c.nome, cpfCnpj: c.cpfCnpj, celular: c.celular, email: c.email }
                      setCliente(info)
                      onClienteEncontrado(info)
                      setErroCpf(null)
                    }
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function VeiculoCard({ veiculo, onLimpar }: { veiculo: VeiculoEncontrado; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-primary-soft border border-primary/30 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-primary-text mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {veiculo.marca} {veiculo.modelo}
          {veiculo.cor && <span className="font-normal text-muted-foreground"> · {veiculo.cor}</span>}
          {veiculo.ano && <span className="font-normal text-muted-foreground"> · {veiculo.ano}</span>}
        </p>
        <p className="text-xs font-mono text-muted-foreground">{veiculo.chassi}</p>
        {veiculo.numeroMotor && <p className="text-xs text-muted-foreground">Motor: {veiculo.numeroMotor}</p>}
        <p className="text-[10px] mt-0.5 text-muted-foreground">
          {veiculo.fonte === 'estoque' ? 'Estoque' : 'Banco histórico'}
        </p>
      </div>
      <button type="button" onClick={onLimpar} aria-label="Limpar veículo" className="text-muted-foreground hover:text-foreground">
        <X size={14} />
      </button>
    </div>
  )
}

function ClienteCard({ cliente, onLimpar }: { cliente: ClienteInfo; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-primary-soft border border-primary/30 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-primary-text mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{cliente.nome}</p>
        {cliente.cpfCnpj && <p className="text-xs text-muted-foreground">CPF: {cliente.cpfCnpj}</p>}
        {cliente.celular  && <p className="text-xs text-muted-foreground">Tel: {cliente.celular}</p>}
      </div>
      <button type="button" onClick={onLimpar} aria-label="Limpar cliente" className="text-muted-foreground hover:text-foreground">
        <X size={14} />
      </button>
    </div>
  )
}
