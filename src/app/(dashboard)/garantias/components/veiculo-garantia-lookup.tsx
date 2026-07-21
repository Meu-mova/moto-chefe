'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, CheckCircle2, AlertCircle, Loader2, X, UserPlus } from 'lucide-react'
import { buscarVeiculoGarantiaAction, cadastrarVeiculoGarantiaAction } from '../buscar-veiculo-action'
import type { VeiculoGarantia } from '../buscar-veiculo-action'
import { statusLabel_legado } from '@/lib/estado-moto'

type Modelo = { id: string; marca: string; modelo: string }
type Loja   = { id: string; nome: string }

type Props = {
  modelos: Modelo[]
  lojas: Loja[]
  isAdmin: boolean
  lojaUsuarioNome: string | null
  onVeiculoSelecionado: (v: VeiculoGarantia | null) => void
}

export function VeiculoGarantiaLookup({ modelos, lojas, isAdmin, lojaUsuarioNome, onVeiculoSelecionado }: Props) {
  const [chassi, setChassi]         = useState('')
  const [resultados, setResultados] = useState<VeiculoGarantia[]>([])
  const [veiculo, setVeiculo]       = useState<VeiculoGarantia | null>(null)
  const [erro, setErro]             = useState<string | null>(null)
  const [listaAberta, setListaAberta] = useState(false)
  const [pendingBusca, startBusca]  = useTransition()
  const [cadastrando, setCadastrando] = useState(false)
  const [pendingCadastro, startCadastro] = useTransition()
  const [novo, setNovo] = useState({ modeloId: '', cor: '', lojaId: '', notaFiscalEntrada: '' })
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

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
    setErro(null); setResultados([]); setListaAberta(false)
    startBusca(async () => {
      const lista = await buscarVeiculoGarantiaAction(chassi)
      if (lista.length === 1) {
        selecionar(lista[0])
      } else if (lista.length > 1) {
        setResultados(lista)
        setListaAberta(true)
      } else {
        setErro('Nenhum veículo encontrado — cadastre para prosseguir')
      }
    })
  }

  function selecionar(v: VeiculoGarantia) {
    setVeiculo(v)
    setResultados([])
    setListaAberta(false)
    setCadastrando(false)
    onVeiculoSelecionado(v)
  }

  function limpar() {
    setVeiculo(null); setChassi(''); setErro(null); setResultados([])
    onVeiculoSelecionado(null)
  }

  function cadastrar() {
    if (!novo.modeloId || !novo.cor.trim() || !novo.notaFiscalEntrada.trim() || (isAdmin && !novo.lojaId)) {
      setErro('Preencha modelo, cor, loja e nota fiscal de entrada')
      return
    }
    startCadastro(async () => {
      try {
        const v = await cadastrarVeiculoGarantiaAction({
          chassi,
          modeloId: novo.modeloId,
          cor: novo.cor,
          lojaId: novo.lojaId,
          notaFiscalEntrada: novo.notaFiscalEntrada,
        })
        selecionar(v)
        setNovo({ modeloId: '', cor: '', lojaId: '', notaFiscalEntrada: '' })
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Erro ao cadastrar veículo')
      }
    })
  }

  return (
    <div className="space-y-2">
      {veiculo ? (
        <VeiculoCard veiculo={veiculo} onLimpar={limpar} />
      ) : (
        <div className="relative">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={chassi}
              onChange={e => { setChassi(e.target.value.toUpperCase()); setErro(null) }}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              onFocus={() => resultados.length > 0 && setListaAberta(true)}
              placeholder="Digite o chassi ou parte dele (mín. 3 caracteres)…"
              className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                erro ? 'border-amber-400' : 'border-slate-200'
              }`}
            />
            <button
              type="button"
              onClick={buscar}
              disabled={pendingBusca || chassi.trim().length < 3}
              className="px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {pendingBusca ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            </button>
          </div>

          {listaAberta && resultados.length > 0 && (
            <div ref={listaRef}
              className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              <p className="px-3 py-2 text-[11px] text-slate-400 border-b bg-slate-50">
                {resultados.length} resultado{resultados.length > 1 ? 's' : ''} — clique para selecionar
              </p>
              <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {resultados.map(r => (
                  <li key={r.motoId}>
                    <button
                      type="button"
                      onClick={() => selecionar(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {r.marca} {r.modelo}
                          {r.cor && <span className="font-normal text-slate-500"> · {r.cor}</span>}
                        </p>
                        <p className="text-xs font-mono text-slate-400">{r.chassi} · {r.lojaNome}</p>
                        {r.clienteNome && (
                          <p className="text-xs text-blue-600">{r.clienteNome}</p>
                        )}
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-slate-100 text-slate-600">
                        {statusLabel_legado[r.status] ?? r.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {erro && !cadastrando && (
            <div className="mt-1 space-y-1.5">
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle size={12} /> {erro}
              </p>
              {chassi.trim().length >= 3 && (
                <button
                  type="button"
                  onClick={() => { setCadastrando(true); setErro(null) }}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <UserPlus size={12} /> Cadastrar este veículo
                </button>
              )}
            </div>
          )}

          {cadastrando && (
            <div className="mt-2 border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Cadastrar veículo — chassi {chassi}
              </p>
              {erro && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {erro}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={novo.modeloId}
                  onChange={e => setNovo(n => ({ ...n, modeloId: e.target.value }))}
                  className="col-span-2 border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">Modelo *</option>
                  {modelos.map(m => (
                    <option key={m.id} value={m.id}>{m.marca} {m.modelo}</option>
                  ))}
                </select>
                <input
                  value={novo.cor}
                  onChange={e => setNovo(n => ({ ...n, cor: e.target.value }))}
                  placeholder="Cor *"
                  className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                />
                {isAdmin ? (
                  <select
                    value={novo.lojaId}
                    onChange={e => setNovo(n => ({ ...n, lojaId: e.target.value }))}
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">Loja *</option>
                    {lojas.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center px-2 text-sm text-slate-500 border border-transparent">
                    Loja: {lojaUsuarioNome ?? '—'}
                  </div>
                )}
                <input
                  value={novo.notaFiscalEntrada}
                  onChange={e => setNovo(n => ({ ...n, notaFiscalEntrada: e.target.value }))}
                  placeholder="Nota fiscal de entrada *"
                  className="col-span-2 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cadastrar}
                  disabled={pendingCadastro}
                  className="flex-1 bg-slate-800 text-white text-xs font-medium rounded-md py-1.5 hover:bg-slate-700 disabled:opacity-50"
                >
                  {pendingCadastro ? 'Salvando…' : 'Salvar veículo'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCadastrando(false); setErro(null) }}
                  disabled={pendingCadastro}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VeiculoCard({ veiculo, onLimpar }: { veiculo: VeiculoGarantia; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {veiculo.marca} {veiculo.modelo}
          {veiculo.cor && <span className="font-normal text-slate-500"> · {veiculo.cor}</span>}
        </p>
        <p className="text-xs font-mono text-slate-500">{veiculo.chassi} · {veiculo.lojaNome}</p>
        {veiculo.clienteNome && <p className="text-xs text-blue-600">{veiculo.clienteNome}</p>}
        <p className="text-[10px] mt-0.5 text-slate-400">
          {statusLabel_legado[veiculo.status] ?? veiculo.status}
        </p>
      </div>
      <button type="button" onClick={onLimpar} className="text-slate-400 hover:text-slate-600">
        <X size={14} />
      </button>
    </div>
  )
}
