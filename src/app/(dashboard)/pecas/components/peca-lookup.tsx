'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Plus } from 'lucide-react'
import { filtrarPecas } from '@/lib/busca-peca'
import { PecaForm } from './peca-form'

export type PecaOpcao = { id: string; nome: string; valor: string; quantidadeEstoque: number }

type Props = {
  pecas: PecaOpcao[]
  selecionada: PecaOpcao | null
  onSelecionar: (peca: PecaOpcao | null) => void
  /** Avisa o pai pra somar a peça nova na lista compartilhada entre as linhas. */
  onPecaCriada: (peca: PecaOpcao) => void
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Campo de digitação com lista filtrada, no lugar do <Select> que listava as ~1.700
 * peças do catálogo inteiro — rolar aquele menu pra achar uma viseira era inviável.
 *
 * Segue o padrão da busca de chassi das garantias (veiculo-garantia-lookup.tsx):
 * input + lista absoluta, fecha ao clicar fora, teclado navega. O filtro roda no
 * cliente porque o catálogo já vem inteiro como prop — sem ida ao servidor.
 */
export function PecaLookup({ pecas, selecionada, onSelecionar, onPecaCriada }: Props) {
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(false)
  const [cadastroAberto, setCadastroAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const resultados = useMemo(() => filtrarPecas(pecas, busca), [pecas, busca])

  // Com o dialog de cadastro aberto o "clique fora" fica suspenso: o dialog vive num
  // portal, então clicar nos campos dele conta como fora daqui e fechava a lista.
  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (cadastroAberto) return
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberta(false)
    }
    document.addEventListener('mousedown', onClickFora)
    return () => document.removeEventListener('mousedown', onClickFora)
  }, [cadastroAberto])

  // Digitar reposiciona o destaque no topo — senão a seta do teclado continuaria
  // apontando pro índice de uma lista que já mudou.
  useEffect(() => { setDestaque(0) }, [busca])

  function escolher(peca: PecaOpcao) {
    onSelecionar(peca)
    setBusca('')
    setAberta(false)
  }

  function limpar() {
    onSelecionar(null)
    setBusca('')
    setAberta(true)
    // O foco tem que voltar pro campo, senão trocar a peça exige um clique a mais.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAberta(true)
      setDestaque(d => Math.min(d + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque(d => Math.max(d - 1, 0))
    } else if (e.key === 'Enter') {
      // Sem preventDefault o Enter submeteria o dialog inteiro em vez de escolher.
      e.preventDefault()
      if (aberta && resultados[destaque]) escolher(resultados[destaque])
    } else if (e.key === 'Escape') {
      setAberta(false)
    }
  }

  if (selecionada) {
    const semEstoque = selecionada.quantidadeEstoque <= 0
    return (
      <div className="flex items-center gap-2 h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs">
        <span className="flex-1 min-w-0 truncate font-medium text-slate-800" title={selecionada.nome}>
          {selecionada.nome}
        </span>
        <span className="shrink-0 text-slate-500">{fmtBRL(parseFloat(selecionada.valor))}</span>
        <span className={`shrink-0 ${semEstoque ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
          est. {selecionada.quantidadeEstoque}
        </span>
        <button
          type="button"
          onClick={limpar}
          title="Trocar peça"
          className="shrink-0 text-slate-400 hover:text-slate-700"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={busca}
        onChange={e => { setBusca(e.target.value); setAberta(true) }}
        onFocus={() => setAberta(true)}
        onKeyDown={onKeyDown}
        placeholder="Digite o nome da peça…"
        className="w-full h-8 rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      {aberta && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {resultados.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolher(p)}
              onMouseEnter={() => setDestaque(i)}
              className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 ${
                i === destaque ? 'bg-blue-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="flex-1 min-w-0 truncate text-slate-800">{p.nome}</span>
              <span className="shrink-0 text-slate-500">{fmtBRL(parseFloat(p.valor))}</span>
              <span className={`shrink-0 ${p.quantidadeEstoque <= 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {p.quantidadeEstoque}
              </span>
            </button>
          ))}

          {resultados.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-slate-500">
              Nenhuma peça com esse nome.
            </p>
          )}

          <div className="border-t border-slate-100 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={() => setCadastroAberto(true)}
              className="w-full flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus size={12} />
              {busca.trim() ? `Cadastrar «${busca.trim()}»` : 'Cadastrar nova peça'}
            </button>
          </div>
        </div>
      )}

      {/* Fora do bloco da lista de propósito: aqui dentro o form era desmontado junto
          com ela e a janela de cadastro sumia sem salvar nada. */}
      <PecaForm
        open={cadastroAberto}
        onOpenChange={setCadastroAberto}
        nomeInicial={busca.trim()}
        onCriada={peca => { onPecaCriada(peca); escolher(peca) }}
      />
    </div>
  )
}
