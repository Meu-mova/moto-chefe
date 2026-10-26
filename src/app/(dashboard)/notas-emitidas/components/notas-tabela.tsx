'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { NotaEmitida } from '@/lib/queries/notas-emitidas'
import { linkDaVenda, selecaoDaPagina, temDocumento, type CategoriaNota, type Situacao, type TipoArquivo } from '@/lib/notas-emitidas'

const POR_PAGINA = 50
const ROTA = '/api/notas-emitidas/arquivos'

const STATUS: Record<CategoriaNota, { texto: string; cor: string }> = {
  autorizada:   { texto: 'Autorizada', cor: 'bg-primary-soft text-primary-text' },
  cancelada:    { texto: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
  recusada:     { texto: 'Recusada', cor: 'bg-destructive/10 text-destructive' },
  em_andamento: { texto: 'Em andamento', cor: 'bg-warning/10 text-warning' },
  descartada:   { texto: 'Descartada', cor: 'bg-muted text-muted-foreground' },
}

export type FiltroDownload = { situacao: Situacao; ambiente: 'Producao' | 'Homologacao'; de: string; ate: string }

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const link = 'text-primary-text underline-offset-4 hover:underline'
const vazio = <span className="text-muted-foreground">-</span>

function hrefArquivo(filtro: FiltroDownload, id: string, tipo: TipoArquivo) {
  return `${ROTA}?${new URLSearchParams({ ...filtro, tipo, id })}`
}

// O nome do arquivo vem no Content-Disposition da rota.
function nomeDaResposta(r: Response) {
  return r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'notas.zip'
}

/**
 * Tabela com seleção estilo Gmail (#402): a caixa do cabeçalho marca a página; a faixa oferece
 * todas as notas do filtro, que vão ao servidor como filtro, e não como lista de ids.
 */
export function NotasTabela({ notas, totalComDocumento, filtro }: {
  notas: NotaEmitida[]
  /** Notas com documento no filtro, pela contagem do banco: passa do teto da lista. */
  totalComDocumento: number
  filtro: FiltroDownload
}) {
  const [pagina, setPagina] = useState(0)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [todasDoFiltro, setTodasDoFiltro] = useState(false)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const cabecalho = useRef<HTMLInputElement>(null)

  const paginas = Math.max(1, Math.ceil(notas.length / POR_PAGINA))
  const linhas = notas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const idsDaPagina = linhas.filter(temDocumento).map(n => n.id)
  const estado = selecaoDaPagina(idsDaPagina, marcadas, todasDoFiltro)

  useEffect(() => {
    if (cabecalho.current) cabecalho.current.indeterminate = estado === 'parte'
  }, [estado])

  function limpar() {
    setMarcadas(new Set())
    setTodasDoFiltro(false)
  }

  function marcarPagina(marcar: boolean) {
    setTodasDoFiltro(false)
    setMarcadas(prev => {
      const novo = new Set(prev)
      for (const id of idsDaPagina) if (marcar) novo.add(id); else novo.delete(id)
      return novo
    })
  }

  function marcar(id: string, marcar: boolean) {
    setTodasDoFiltro(false)
    setMarcadas(prev => {
      const novo = new Set(prev)
      if (marcar) novo.add(id); else novo.delete(id)
      return novo
    })
  }

  // fetch e não navegação: o erro aparece na tela em vez de abrir uma página com JSON.
  async function baixar(tipo: TipoArquivo | 'ambos', ids: string[]) {
    setBaixando(tipo)
    setErro(null)
    try {
      const r = await fetch(ROTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filtro, tipo, id: ids }),
      })
      if (!r.ok) {
        setErro((await r.json().catch(() => null))?.error ?? 'Não foi possível baixar as notas. Tente de novo.')
        return
      }
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = nomeDaResposta(r)
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErro('Não foi possível baixar as notas. Confira a conexão e tente de novo.')
    } finally {
      setBaixando(null)
    }
  }

  const idsSelecionados = todasDoFiltro ? [] : [...marcadas]
  const qtdSelecionada = todasDoFiltro ? totalComDocumento : marcadas.size
  const botoes = (ids: string[]) => (
    <span className="inline-flex gap-2">
      {(['xml', 'pdf'] as const).map(tipo => (
        <Button key={tipo} size="sm" variant="outline" disabled={baixando !== null} onClick={() => baixar(tipo, ids)}>
          {baixando === tipo ? <Loader2 className="animate-spin" /> : <Download />} {tipo.toUpperCase()}
        </Button>
      ))}
    </span>
  )

  if (notas.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma nota neste filtro.</p>

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" disabled={baixando !== null || totalComDocumento === 0} onClick={() => baixar('ambos', [])}>
          {baixando === 'ambos' ? <Loader2 className="animate-spin" /> : <Download />}
          Baixar as {totalComDocumento} do filtro
        </Button>
      </div>

      {qtdSelecionada > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-text">
          {estado === 'filtro' ? (
            <span>Todas as {totalComDocumento} notas do filtro estão selecionadas.</span>
          ) : estado === 'pagina' && totalComDocumento > idsDaPagina.length && marcadas.size === idsDaPagina.length ? (
            <span>
              As {idsDaPagina.length} notas desta página estão selecionadas.{' '}
              <button type="button" className={`font-medium ${link}`} onClick={() => setTodasDoFiltro(true)}>
                Selecionar todas as {totalComDocumento} notas do filtro
              </button>
            </span>
          ) : (
            <span>{qtdSelecionada} {qtdSelecionada === 1 ? 'nota selecionada' : 'notas selecionadas'}</span>
          )}
          {botoes(idsSelecionados)}
          <button type="button" className={`font-medium ${link}`} onClick={limpar}>Limpar seleção</button>
        </div>
      )}

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <div className="overflow-x-auto">
        <table aria-label="Notas emitidas" className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="w-8 py-2 pr-3 text-left">
                <input ref={cabecalho} type="checkbox" aria-label="Selecionar as notas desta página" className="size-4 cursor-pointer accent-primary"
                  checked={estado === 'pagina' || estado === 'filtro'} disabled={idsDaPagina.length === 0}
                  onChange={e => marcarPagina(e.target.checked)} />
              </th>
              <th scope="col" className="py-2 pr-3 text-left font-semibold">Nota</th>
              <th scope="col" className="hidden py-2 pr-3 text-left font-semibold lg:table-cell">Série</th>
              <th scope="col" className="py-2 pr-3 text-left font-semibold">Venda</th>
              <th scope="col" className="hidden py-2 pr-3 text-left font-semibold lg:table-cell">Cliente</th>
              <th scope="col" className="py-2 pr-3 text-left font-semibold">Status</th>
              <th scope="col" className="hidden py-2 pr-3 text-left font-semibold lg:table-cell">Motivo</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Data</th>
              <th scope="col" className="py-2 text-right font-semibold">Arquivos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map(n => {
              const doc = temDocumento(n)
              const venda = linkDaVenda(n)
              return (
                <tr key={n.id} className="hover:bg-muted">
                  <td className="py-2 pr-3 align-top">
                    {doc && (
                      <input type="checkbox" aria-label={`Selecionar a nota ${n.numero ?? ''}`} className="size-4 cursor-pointer accent-primary"
                        checked={todasDoFiltro || marcadas.has(n.id)} onChange={e => marcar(n.id, e.target.checked)} />
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top tabular-nums">
                    <span className="font-semibold text-foreground">{n.numero ?? '-'}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground lg:hidden">
                      série {n.serie ?? '-'}{n.clienteNome && `, ${n.clienteNome}`}{n.motivoStatus && `, ${n.motivoStatus}`}
                    </span>
                  </td>
                  <td className="hidden py-2 pr-3 align-top text-muted-foreground lg:table-cell">{n.serie ?? '-'}</td>
                  <td className="py-2 pr-3 align-top tabular-nums">
                    {n.vendaNumero == null ? vazio : venda ? <Link href={venda} className={link}>#{n.vendaNumero}</Link> : <>#{n.vendaNumero}</>}
                  </td>
                  <td className="hidden py-2 pr-3 align-top lg:table-cell">{n.clienteNome ?? vazio}</td>
                  <td className="py-2 pr-3 align-top"><Badge className={STATUS[n.categoria].cor} title={n.status}>{STATUS[n.categoria].texto}</Badge></td>
                  <td className="hidden max-w-xs whitespace-normal py-2 pr-3 align-top text-muted-foreground lg:table-cell">{n.motivoStatus ?? '-'}</td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums text-muted-foreground">{data(n.criadoEm)}</td>
                  <td className="py-2 text-right align-top">
                    {doc ? (
                      <span className="inline-flex gap-3">
                        <a href={hrefArquivo(filtro, n.id, 'pdf')} download className={link}>PDF</a>
                        <a href={hrefArquivo(filtro, n.id, 'xml')} download className={link}>XML</a>
                      </span>
                    ) : <span className="text-muted-foreground">sem documento</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
          <span className="tabular-nums">Página {pagina + 1} de {paginas}</span>
          <Button size="sm" variant="outline" disabled={pagina === paginas - 1} onClick={() => setPagina(p => p + 1)} aria-label="Próxima página"><ChevronRight /></Button>
        </nav>
      )}
    </div>
  )
}
