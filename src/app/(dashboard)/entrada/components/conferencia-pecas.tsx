'use client'

import { useState } from 'react'
import {
  avisoDaLinha, problemaDaLinha, resumoDaLinha,
  type Destino, type LinhaConferencia,
} from '@/lib/conferencia-pecas'
import type { Conferencia } from '@/lib/entrada-pecas'

const real = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DESTINOS: { valor: Destino; titulo: string; frase: string }[] = [
  { valor: 'catalogo', titulo: 'Peça do catálogo', frase: 'Soma no estoque de uma peça que já existe.' },
  { valor: 'nova', titulo: 'Cadastrar peça nova', frase: 'Cria a peça com este nome e preço.' },
  { valor: 'ignorar', titulo: 'Não dar entrada', frase: 'Frete, brinde ou material de uso.' },
]

type Props = {
  linhas: LinhaConferencia[]
  onChange: (i: number, patch: Partial<LinhaConferencia>) => void
  pecas: Conferencia['pecas']
  sugestoes: Conferencia['sugestoes']
  lojaNome: string
}

export function ConferenciaPecas({ linhas, onChange, pecas, sugestoes, lojaNome }: Props) {
  const [sel, setSel] = useState(0)
  const atual = linhas[sel]
  const nomePeca = (id: string) => pecas.find(p => p.id === id)?.nome

  function destinoNaTabela(l: LinhaConferencia) {
    if (l.destino === 'ignorar') return 'Não dar entrada'
    if (l.destino === 'nova') return 'Peça nova'
    return nomePeca(l.pecaId) ?? 'Escolher peça'
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="bg-card rounded-lg border p-4">
        <h3 className="font-semibold text-foreground mb-3">Peças e acessórios da nota ({linhas.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 px-2 font-medium">Item da nota</th>
              <th className="py-2 pr-2 font-medium whitespace-nowrap">Custo na nota</th>
              <th className="py-2 pr-2 font-medium">Qtd</th>
              <th className="py-2 font-medium">Vai para</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const problema = problemaDaLinha(l)
              const aviso = avisoDaLinha(l)
              return (
                <tr
                  key={i}
                  onClick={() => setSel(i)}
                  className={[
                    'border-b cursor-pointer align-top',
                    i === sel ? 'outline outline-2 -outline-offset-2 outline-primary' : '',
                    problema || aviso ? 'bg-muted' : '',
                    l.destino === 'ignorar' ? 'text-muted-foreground' : '',
                  ].join(' ')}
                >
                  <td className="py-2 px-2">
                    {l.item.nomeLegivel}
                    {problema && <p className="text-xs text-destructive mt-1">{problema}</p>}
                    {aviso && <p className="text-xs text-warning mt-1">{aviso}</p>}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">{real(l.item.custoUnitario)}</td>
                  <td className="py-2 pr-2">
                    <input
                      inputMode="numeric"
                      aria-label={`Quantidade de ${l.item.nomeLegivel}`}
                      value={l.quantidade}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onChange(i, { quantidade: e.target.value })}
                      className="w-16 border border-input rounded-md px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {destinoNaTabela(l)}
                    {l.destino === 'catalogo' && sugestoes[i] && l.pecaId === sugestoes[i] && (
                      <span className="ml-1 rounded-full bg-primary-soft text-primary-text text-xs px-2 py-0.5">sugerida</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {atual && (
        <aside className="bg-card rounded-lg border flex flex-col xl:sticky xl:top-4 self-start" aria-label="Linha selecionada">
          <div className="p-4 space-y-4">
            <div>
              <p className="font-semibold text-foreground leading-snug">{atual.item.nomeLegivel}</p>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <span className="block text-xs text-muted-foreground">Custo na nota</span>
                  <span className="text-lg font-semibold">{real(atual.item.custoUnitario)}</span>
                </div>
                <label className="block">
                  <span className="block text-xs text-muted-foreground">Quantidade</span>
                  <input
                    inputMode="numeric"
                    value={atual.quantidade}
                    onChange={e => onChange(sel, { quantidade: e.target.value })}
                    className="w-20 border border-input rounded-md px-2 py-1 text-base"
                  />
                </label>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="sr-only">O que fazer com este item</legend>
              {DESTINOS.map(d => {
                const escolhido = atual.destino === d.valor
                return (
                  <div
                    key={d.valor}
                    className={`rounded-lg border p-3 ${escolhido ? 'border-primary bg-primary-soft' : ''}`}
                  >
                    <label className="flex gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`destino-${sel}`}
                        checked={escolhido}
                        onChange={() => onChange(sel, {
                          destino: d.valor,
                          ...(d.valor === 'nova' && !atual.nome ? { nome: atual.item.nomeLegivel } : {}),
                        })}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-semibold text-foreground">{d.titulo}</span>
                        <span className="block text-xs text-muted-foreground">{d.frase}</span>
                      </span>
                    </label>

                    {escolhido && d.valor === 'catalogo' && (
                      <div className="mt-3 space-y-1">
                        <select
                          aria-label="Peça do catálogo"
                          value={atual.pecaId}
                          onChange={e => onChange(sel, { pecaId: e.target.value })}
                          className="w-full border border-input rounded-md px-2 py-2 text-sm bg-card"
                        >
                          <option value="">Escolha a peça</option>
                          {pecas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                        {atual.pecaId && (
                          <p className="text-xs text-muted-foreground">
                            Preço de venda atual: {real(pecas.find(p => p.id === atual.pecaId)?.valor ?? 0)}
                            {sugestoes[sel] === atual.pecaId ? '. Sugerida pelo fornecedor.' : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {escolhido && d.valor === 'nova' && (
                      <div className="mt-3 space-y-3">
                        <label className="block">
                          <span className="block text-xs text-muted-foreground mb-1">Nome da peça</span>
                          <input
                            value={atual.nome}
                            onChange={e => onChange(sel, { nome: e.target.value })}
                            className="w-full border border-input rounded-md px-2 py-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs text-muted-foreground mb-1">Preço de venda</span>
                          <input
                            inputMode="decimal"
                            placeholder="R$ 0,00"
                            value={atual.preco}
                            onChange={e => onChange(sel, { preco: e.target.value })}
                            className="w-full border border-input rounded-md px-2 py-2 text-sm"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </fieldset>
          </div>

          <div className="border-t p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {resumoDaLinha(atual, lojaNome, nomePeca(atual.pecaId))}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Linha {sel + 1} de {linhas.length}</span>
              <button
                type="button"
                disabled={sel >= linhas.length - 1}
                onClick={() => setSel(s => Math.min(s + 1, linhas.length - 1))}
                className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Próxima linha
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
