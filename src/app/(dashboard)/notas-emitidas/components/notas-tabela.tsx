'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { diaBrt } from '@/lib/data-venda'
import { marcarVarias } from '@/lib/selecao'
import type { NotaEmitidaComInutilizacao } from '@/lib/queries/notas-emitidas'
import { colunaMotivoVisivel, linkDaVenda, marcarNota, selecaoDaPagina, temDocumento, type Situacao, type TipoArquivo } from '@/lib/notas-emitidas'
import { AcoesDaNota } from './acoes-da-nota'
import { InutilizarDialogo, type NotaDoDialogo } from './inutilizar-dialogo'
import { MotivoDialogo } from './motivo-dialogo'
import { NotasCartoes } from './notas-cartoes'
import { SeloStatus } from './selo-status'
import { SituacaoInutilizacao } from './situacao-inutilizacao'

const POR_PAGINA = 50
const ROTA = '/api/notas-emitidas/arquivos'

export type FiltroDownload = { situacao: Situacao; ambiente: 'Producao' | 'Homologacao'; de: string; ate: string }

const link = 'text-primary-text underline-offset-4 hover:underline'
const vazio = <span className="text-muted-foreground">-</span>
// Toda célula com a mesma altura e alinhada ao centro: o segundo selo não faz a linha crescer (#597).
const celula = 'h-14 py-0 pr-3 align-middle'

// O nome do arquivo vem no Content-Disposition da rota.
function nomeDaResposta(r: Response) {
  return r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'notas.zip'
}

/**
 * Tabela com seleção estilo Gmail (#402): a caixa do cabeçalho marca a página; a faixa oferece
 * todas as notas do filtro, que vão ao servidor como filtro, e não como lista de ids. As ações
 * da nota ficam no menu da linha (#597).
 */
export function NotasTabela({ notas, totalComDocumento, filtro, podeInutilizar }: {
  notas: NotaEmitidaComInutilizacao[]
  /** Notas com documento no filtro, pela contagem do banco: passa do teto da lista. */
  totalComDocumento: number
  filtro: FiltroDownload
  /** podePedirInutilizacao(papel), a mesma regra do servidor (#597). */
  podeInutilizar: boolean
}) {
  const [pagina, setPagina] = useState(0)
  // Fora da linha: a linha muda depois do pedido e os diálogos continuam na tela (C6).
  const [paraInutilizar, setParaInutilizar] = useState<NotaDoDialogo | null>(null)
  const [motivoDe, setMotivoDe] = useState<NotaEmitidaComInutilizacao | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [selecionando, setSelecionando] = useState(false)
  const [todasDoFiltro, setTodasDoFiltro] = useState(false)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const cabecalho = useRef<HTMLInputElement>(null)

  const paginas = Math.max(1, Math.ceil(notas.length / POR_PAGINA))
  const linhas = notas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const idsDaPagina = linhas.filter(temDocumento).map(n => n.id)
  const estado = selecaoDaPagina(idsDaPagina, marcadas, todasDoFiltro)
  const mostraMotivo = colunaMotivoVisivel(filtro.situacao)

  useEffect(() => {
    if (cabecalho.current) cabecalho.current.indeterminate = estado === 'parte'
  }, [estado])

  function limpar() {
    setMarcadas(new Set())
    setTodasDoFiltro(false)
  }

  function selecionar(ligar: boolean) {
    if (!ligar) limpar()
    setSelecionando(ligar)
  }

  function marcarPagina(marcar: boolean) {
    setTodasDoFiltro(false)
    setMarcadas(prev => marcarVarias(prev, idsDaPagina, marcar))
  }

  function marcar(id: string, marcar: boolean) {
    setMarcadas(prev => marcarNota(prev, todasDoFiltro, id, marcar))
  }

  // fetch e não navegação: o erro aparece na tela em vez de abrir uma página com JSON.
  // `chave` diz qual botão gira enquanto baixa.
  async function baixar(tipo: TipoArquivo | 'ambos', ids: string[], chave: string = tipo) {
    setBaixando(chave)
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
  // O mesmo menu na linha da tabela e no cartão do celular.
  const acoes = (n: NotaEmitidaComInutilizacao, className?: string) => (
    <AcoesDaNota nota={n} podeInutilizar={podeInutilizar} ocupado={baixando !== null} className={className}
      onVerMotivo={() => setMotivoDe(n)} onBaixar={tipo => baixar(tipo, [n.id], `${tipo}:${n.id}`)} onInutilizar={() => setParaInutilizar(n)} />
  )

  // Fora de qualquer ramo: a lista pode esvaziar com um diálogo aberto, e ele tem de continuar na tela (C6).
  const dialogos = (
    <>
      <InutilizarDialogo nota={paraInutilizar} onFechar={() => setParaInutilizar(null)} />
      <MotivoDialogo nota={motivoDe} onFechar={() => setMotivoDe(null)} />
    </>
  )

  if (notas.length === 0) return <><p className="py-6 text-center text-sm text-muted-foreground">Nenhuma nota neste filtro.</p>{dialogos}</>

  return (
    <div className="space-y-2">
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <NotasCartoes notas={linhas} total={notas.length} selecionando={selecionando} onSelecionar={selecionar} qtd={qtdSelecionada} estado={estado} onMarcarTodas={marcarPagina}
        marcadas={marcadas} onMarcar={marcar} baixando={baixando === 'selecao'} onBaixar={() => baixar('ambos', idsSelecionados, 'selecao')} acoes={acoes} />

      <div className="hidden md:block">
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
                <th scope="col" className="py-2 pr-3 text-left font-semibold">Série</th>
                <th scope="col" className="py-2 pr-3 text-left font-semibold">Venda</th>
                <th scope="col" className="py-2 pr-3 text-left font-semibold">Cliente</th>
                <th scope="col" className="py-2 pr-3 text-left font-semibold">Status</th>
                {mostraMotivo && <th scope="col" className="py-2 pr-3 text-left font-semibold">Motivo</th>}
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Data</th>
                <th scope="col" className="w-10 py-2 text-right"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map(n => {
                const doc = temDocumento(n)
                const venda = linkDaVenda(n)
                return (
                  <tr key={n.id} className="hover:bg-muted">
                    {/* Coluna reservada: a nota sem documento ocupa o mesmo espaço, e o número alinha. */}
                    <td className={celula}>
                      {doc ? (
                        <input type="checkbox" aria-label={`Selecionar a nota ${n.numero ?? ''}`} className="block size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                          disabled={todasDoFiltro} title={todasDoFiltro ? 'Limpe a seleção para escolher notas' : undefined}
                          checked={todasDoFiltro || marcadas.has(n.id)} onChange={e => marcar(n.id, e.target.checked)} />
                      ) : <span aria-hidden className="block size-4" />}
                    </td>
                    <td className={`${celula} font-semibold tabular-nums text-foreground`}>{n.numero ?? '-'}</td>
                    <td className={`${celula} text-muted-foreground`}>{n.serie ?? '-'}</td>
                    <td className={`${celula} tabular-nums`}>
                      {n.vendaNumero == null ? vazio : venda ? <Link href={venda} className={link}>#{n.vendaNumero}</Link> : <>#{n.vendaNumero}</>}
                    </td>
                    <td className={`${celula} max-w-48 truncate`}>{n.clienteNome ?? vazio}</td>
                    <td className={celula}>
                      <span className="flex flex-col items-start gap-1">
                        <SeloStatus nota={n} />
                        <SituacaoInutilizacao decisao={n.inutilizacao} />
                      </span>
                    </td>
                    {mostraMotivo && (
                      <td className={`${celula} max-w-64 truncate text-muted-foreground`} title={n.motivoStatus ?? undefined}>{n.motivoStatus ?? ''}</td>
                    )}
                    <td className={`${celula} text-right tabular-nums text-muted-foreground`}>{diaBrt(n.criadoEm)}</td>
                    <td className="h-14 py-0 text-right align-middle">{acoes(n)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
          <span className="tabular-nums">Página {pagina + 1} de {paginas}</span>
          <Button size="sm" variant="outline" disabled={pagina === paginas - 1} onClick={() => setPagina(p => p + 1)} aria-label="Próxima página"><ChevronRight /></Button>
        </nav>
      )}

      {dialogos}
    </div>
  )
}
