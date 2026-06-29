'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, CheckCircle2, AlertCircle, Loader2, X, Bike, Archive } from 'lucide-react'
import { buscarVeiculoPorChassisAction, buscarClientePorCpfAction } from '../buscar-veiculo-action'
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
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Chassi do veículo <span className="text-red-500">*</span>
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
                className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                  erroChassi ? 'border-amber-400' : 'border-slate-200'
                }`}
              />
              <button
                onClick={buscar}
                disabled={pendingV || chassi.trim().length < 3}
                className="px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {pendingV ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            </div>

            {/* Dropdown de resultados */}
            {listaAberta && resultados.length > 0 && (
              <div ref={listaRef}
                className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                <p className="px-3 py-2 text-[11px] text-slate-400 border-b bg-slate-50">
                  {resultados.length} resultado{resultados.length > 1 ? 's' : ''} — clique para selecionar
                </p>
                <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {resultados.map(r => (
                    <li key={r.chassi}>
                      <button
                        type="button"
                        onClick={() => selecionarVeiculo(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3"
                      >
                        {r.fonte === 'estoque'
                          ? <Bike size={14} className="text-blue-500 shrink-0" />
                          : <Archive size={14} className="text-slate-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {r.marca} {r.modelo}
                            {r.cor && <span className="font-normal text-slate-500"> · {r.cor}</span>}
                          </p>
                          <p className="text-xs font-mono text-slate-400">{r.chassi}</p>
                          {r.clienteNome && (
                            <p className="text-xs text-blue-600">{r.clienteNome}</p>
                          )}
                        </div>
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          r.fonte === 'estoque'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.fonte === 'estoque' ? 'Estoque' : 'Histórico'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erroChassi && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                <AlertCircle size={12} /> {erroChassi}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Busca por CPF */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
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
                className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                  erroCpf ? 'border-red-400' : 'border-slate-200'
                }`}
              />
              <button
                onClick={buscarCpf}
                disabled={pendingC || cpf.replace(/\D/g, '').length < 11}
                className="px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {pendingC ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            </div>
            {erroCpf && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <AlertCircle size={12} /> {erroCpf}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function VeiculoCard({ veiculo, onLimpar }: { veiculo: VeiculoEncontrado; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {veiculo.marca} {veiculo.modelo}
          {veiculo.cor && <span className="font-normal text-slate-500"> · {veiculo.cor}</span>}
          {veiculo.ano && <span className="font-normal text-slate-500"> · {veiculo.ano}</span>}
        </p>
        <p className="text-xs font-mono text-slate-500">{veiculo.chassi}</p>
        {veiculo.numeroMotor && <p className="text-xs text-slate-400">Motor: {veiculo.numeroMotor}</p>}
        <p className="text-[10px] mt-0.5 text-slate-400">
          {veiculo.fonte === 'estoque' ? 'Estoque' : 'Banco histórico'}
        </p>
      </div>
      <button onClick={onLimpar} className="text-slate-400 hover:text-slate-600">
        <X size={14} />
      </button>
    </div>
  )
}

function ClienteCard({ cliente, onLimpar }: { cliente: ClienteInfo; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-blue-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{cliente.nome}</p>
        {cliente.cpfCnpj && <p className="text-xs text-slate-500">CPF: {cliente.cpfCnpj}</p>}
        {cliente.celular  && <p className="text-xs text-slate-500">Tel: {cliente.celular}</p>}
      </div>
      <button onClick={onLimpar} className="text-slate-400 hover:text-slate-600">
        <X size={14} />
      </button>
    </div>
  )
}
