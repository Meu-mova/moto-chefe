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
              className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring ${
                erro ? 'border-warning/50' : 'border-border'
              }`}
            />
            <button
              type="button"
              onClick={buscar}
              disabled={pendingBusca || chassi.trim().length < 3}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {pendingBusca ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            </button>
          </div>

          {listaAberta && resultados.length > 0 && (
            <div ref={listaRef}
              className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-b bg-muted">
                {resultados.length} resultado{resultados.length > 1 ? 's' : ''} — clique para selecionar
              </p>
              <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                {resultados.map(r => (
                  <li key={r.motoId}>
                    <button
                      type="button"
                      onClick={() => selecionar(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-center gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {r.marca} {r.modelo}
                          {r.cor && <span className="font-normal text-muted-foreground"> · {r.cor}</span>}
                        </p>
                        <p className="text-xs font-mono text-muted-foreground">{r.chassi} · {r.lojaNome}</p>
                        {r.clienteNome && (
                          <p className="text-xs text-info">{r.clienteNome}</p>
                        )}
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-muted text-muted-foreground">
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
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertCircle size={12} /> {erro}
              </p>
              {chassi.trim().length >= 3 && (
                <button
                  type="button"
                  onClick={() => { setCadastrando(true); setErro(null) }}
                  className="text-xs text-info hover:underline flex items-center gap-1"
                >
                  <UserPlus size={12} /> Cadastrar este veículo
                </button>
              )}
            </div>
          )}

          {cadastrando && (
            <div className="mt-2 border border-border rounded-lg p-3 space-y-2 bg-muted">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cadastrar veículo — chassi {chassi}
              </p>
              {erro && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle size={12} /> {erro}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={novo.modeloId}
                  onChange={e => setNovo(n => ({ ...n, modeloId: e.target.value }))}
                  className="col-span-2 border border-border rounded-md px-2 py-1.5 text-sm bg-card"
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
                  className="border border-border rounded-md px-2 py-1.5 text-sm"
                />
                {isAdmin ? (
                  <select
                    value={novo.lojaId}
                    onChange={e => setNovo(n => ({ ...n, lojaId: e.target.value }))}
                    className="border border-border rounded-md px-2 py-1.5 text-sm bg-card"
                  >
                    <option value="">Loja *</option>
                    {lojas.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center px-2 text-sm text-muted-foreground border border-transparent">
                    Loja: {lojaUsuarioNome ?? '—'}
                  </div>
                )}
                <input
                  value={novo.notaFiscalEntrada}
                  onChange={e => setNovo(n => ({ ...n, notaFiscalEntrada: e.target.value }))}
                  placeholder="Nota fiscal de entrada *"
                  className="col-span-2 border border-border rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cadastrar}
                  disabled={pendingCadastro}
                  className="flex-1 bg-primary text-primary-foreground text-xs font-medium rounded-md py-1.5 hover:bg-primary-hover disabled:opacity-50"
                >
                  {pendingCadastro ? 'Salvando…' : 'Salvar veículo'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCadastrando(false); setErro(null) }}
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
  )
}

function VeiculoCard({ veiculo, onLimpar }: { veiculo: VeiculoGarantia; onLimpar: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-success/10 border border-success/30 rounded-lg p-3">
      <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {veiculo.marca} {veiculo.modelo}
          {veiculo.cor && <span className="font-normal text-muted-foreground"> · {veiculo.cor}</span>}
        </p>
        <p className="text-xs font-mono text-muted-foreground">{veiculo.chassi} · {veiculo.lojaNome}</p>
        {veiculo.clienteNome && <p className="text-xs text-info">{veiculo.clienteNome}</p>}
        <p className="text-[10px] mt-0.5 text-muted-foreground">
          {statusLabel_legado[veiculo.status] ?? veiculo.status}
        </p>
      </div>
      <button type="button" onClick={onLimpar} className="text-muted-foreground hover:text-foreground">
        <X size={14} />
      </button>
    </div>
  )
}
