'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { matchPagamentos, precisaConciliar, type PgtoOS } from '@/lib/conciliacao-status'
import {
  buscarConciliacoesDoAlvo,
  buscarPixDoAlvo,
  buscarConciliacoesPorValor,
  buscarConciliacoesLivres,
  buscarPixLivres,
  vincularVendaAction,
  vincularPixAlvoAction,
  forcarConciliacaoAction,
  desfazerConciliacaoForcadaAction,
  type AlvoConciliacao,
  type PixLivre,
} from '@/app/(dashboard)/conciliacao/actions'

type Conc      = Awaited<ReturnType<typeof buscarConciliacoesDoAlvo>>[number]
type PixRec    = Awaited<ReturnType<typeof buscarPixDoAlvo>>[number]
type Candidato = Awaited<ReturnType<typeof buscarConciliacoesPorValor>>[number]

const GESTORES   = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência Bancária', cortesia: 'Cortesia / Garantia', gratuita: 'Gratuita',
  bonificacao: 'Bonificação', cupom_revisao: 'Cupom de revisão',
}
const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
  cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
}

const fmt = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Estado dos lançamentos de um alvo (venda de moto, peça ou OS). Fica num hook, e não
// escondido dentro do painel, porque o dialog de detalhes da venda também precisa dos
// `concs` por fora — é deles que sai o cálculo de taxas e valor líquido.
export function useConciliacaoAlvo(alvo: AlvoConciliacao, ativo: boolean) {
  const [concs, setConcs]     = useState<Conc[]>([])
  const [pixRecs, setPixRecs] = useState<PixRec[]>([])
  const [loading, setLoading] = useState(false)

  const { tipo, id } = alvo

  const recarregar = useCallback(async () => {
    setLoading(true)
    try {
      const [c, px] = await Promise.all([
        buscarConciliacoesDoAlvo({ tipo, id }),
        buscarPixDoAlvo({ tipo, id }),
      ])
      setConcs(c)
      setPixRecs(px)
    } finally {
      setLoading(false)
    }
  }, [tipo, id])

  useEffect(() => {
    if (ativo) recarregar()
  }, [ativo, recarregar])

  return { concs, pixRecs, loading, recarregar }
}

type Props = {
  alvo: AlvoConciliacao
  pagamentos: PgtoOS[]
  dados: ReturnType<typeof useConciliacaoAlvo>
  papel: string
  /** OS e peça mostram só o que precisa conciliar; a venda mostra o carrinho inteiro. */
  somenteConciliaveis?: boolean
}

export function PagamentosConciliacao({ alvo, pagamentos, dados, papel, somenteConciliaveis = false }: Props) {
  const { concs, pixRecs, loading, recarregar } = dados

  const podeBuscar = GESTORES.has(papel)
  const podeForcar = papel === 'admin_geral'

  const [buscandoIdx, setBuscandoIdx]   = useState<number | null>(null)
  // Cartão e PIX moram em tabelas diferentes; a linha aberta manda qual das duas
  // buscar, e só uma das listas fica preenchida por vez.
  const [buscandoPix, setBuscandoPix]   = useState(false)
  const [candidatos, setCandidatos]     = useState<Candidato[]>([])
  const [candidatosPix, setCandidatosPix] = useState<PixLivre[]>([])
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [vinculando, setVinculando]     = useState(false)

  const [buscaLivre, setBuscaLivre]         = useState('')
  const [livres, setLivres]                 = useState<Candidato[]>([])
  const [livresPix, setLivresPix]           = useState<PixLivre[]>([])
  const [livreLoading, setLivreLoading]     = useState(false)
  const [buscouLivre, setBuscouLivre]       = useState(false)

  const [forcandoIdx, setForcandoIdx] = useState<number | null>(null)
  const [motivo, setMotivo]           = useState('')
  const [salvando, setSalvando]       = useState(false)

  const conciliados = matchPagamentos(pagamentos, concs, pixRecs)

  function limparBusca() {
    setCandidatos([])
    setCandidatosPix([])
    setLivres([])
    setLivresPix([])
    setBuscaLivre('')
    setBuscouLivre(false)
  }

  async function abrirBusca(idx: number, valor: number, ehPix: boolean) {
    if (buscandoIdx === idx) { setBuscandoIdx(null); return }
    setBuscandoIdx(idx)
    setBuscandoPix(ehPix)
    setBuscaLoading(true)
    limparBusca()
    try {
      if (ehPix) setCandidatosPix(await buscarPixLivres(valor))
      else       setCandidatos(await buscarConciliacoesPorValor(valor))
    } catch {
      toast.error(ehPix ? 'Erro ao buscar recebimentos PIX' : 'Erro ao buscar transações')
      setBuscandoIdx(null)
    } finally {
      setBuscaLoading(false)
    }
  }

  async function buscarLivre() {
    if (buscaLivre.trim().length < 2) return
    setLivreLoading(true)
    setBuscouLivre(false)
    try {
      if (buscandoPix) setLivresPix(await buscarPixLivres(0, buscaLivre))
      else             setLivres(await buscarConciliacoesLivres(buscaLivre))
      setBuscouLivre(true)
    } catch {
      toast.error('Erro na busca')
    } finally {
      setLivreLoading(false)
    }
  }

  async function vincular(conciliacaoId: string) {
    setVinculando(true)
    try {
      await vincularVendaAction(conciliacaoId, alvo.id, alvo.tipo)
      await recarregar()
      setBuscandoIdx(null)
      limparBusca()
      toast.success('Pagamento conciliado')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  async function vincularPix(pixId: string) {
    setVinculando(true)
    try {
      await vincularPixAlvoAction(pixId, alvo)
      await recarregar()
      setBuscandoIdx(null)
      limparBusca()
      toast.success('PIX conciliado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  async function forcar() {
    if (forcandoIdx === null) return
    const idx = forcandoIdx
    setSalvando(true)
    try {
      await forcarConciliacaoAction(alvo, idx, motivo)
      setForcandoIdx(null)
      setMotivo('')
      setBuscandoIdx(null)
      // Desfazer no próprio aviso: um toque errado não vira retrabalho.
      toast.success('Pagamento marcado como recebido', { action: { label: 'Desfazer', onClick: () => desfazer(idx) } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao forçar conciliação')
    } finally {
      setSalvando(false)
    }
  }

  async function desfazer(idx: number) {
    setSalvando(true)
    try {
      await desfazerConciliacaoForcadaAction(alvo, idx)
      toast.success('Conciliação forçada desfeita')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desfazer')
    } finally {
      setSalvando(false)
    }
  }

  function abrirOuFechar(i: number, p: PgtoOS) {
    if (buscandoIdx === i || forcandoIdx === i) { setBuscandoIdx(null); setForcandoIdx(null); return }
    setForcandoIdx(null)
    // Financiamento não tem o que buscar: o banco deposita e nada no sistema registra.
    if (podeBuscar && p.tipo !== 'financiamento') abrirBusca(i, p.valor, p.tipo === 'pix')
    else setBuscandoIdx(i)
  }

  function renderCandidato(c: Candidato) {
    const raw = c.rawData as { bandeira?: string; portador?: string } | null
    const titulo = `${OPERADORA_LABEL[c.operadora] ?? c.operadora}${raw?.bandeira ? ` · ${raw.bandeira}` : ''} · ${c.tipo === 'debito' ? 'Débito' : 'Crédito'}`
    const data = c.dataTransacao ? new Date(c.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
    return (
      <Sugestao
        key={c.id}
        titulo={titulo}
        detalhes={[raw?.portador ? `Portador: ${raw.portador}` : '', `${c.autorizacao ? `Aut. #${c.autorizacao}` : 'Sem autorização'} · ${data} · ${fmt(c.valorBruto)}`]}
        valor={c.valorBruto}
        onVincular={() => vincular(c.id)}
        vinculando={vinculando}
        rotulo={`Vincular ${titulo}, ${data}, ${fmt(c.valorBruto)}`}
      />
    )
  }

  function renderCandidatoPix(p: PixLivre) {
    const quando = new Date(p.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    const quem = p.pagadorNome ?? 'Pagador não informado'
    return (
      <Sugestao
        key={p.id}
        titulo={quem}
        detalhes={[[p.descricao, quando, fmt(p.valor)].filter(Boolean).join(' · ')]}
        valor={p.valor}
        onVincular={() => vincularPix(p.id)}
        vinculando={vinculando}
        rotulo={`Vincular PIX de ${quem}, ${quando}, ${fmt(p.valor)}`}
      />
    )
  }

  const modo = buscandoPix ? MODO.pix : MODO.cartao
  const sugestoes = buscandoPix ? candidatosPix.map(renderCandidatoPix) : candidatos.map(renderCandidato)
  const achadosLivres = buscandoPix ? livresPix.map(renderCandidatoPix) : livres.map(renderCandidato)

  // Situação de cada pagamento, já na ordem em que aparece: pendentes primeiro.
  const itens = pagamentos.map((p, i) => {
    const precisa    = precisaConciliar(p.tipo)
    const cobertura  = conciliados[i]
    const forcado    = Boolean(p.conciliadoManual)
    const conciliado = precisa && cobertura.conciliado
    const pendente   = precisa && !loading && !cobertura.conciliado
    // Achou dinheiro, mas menos do que foi lançado: nem verde nem vermelho.
    const parcial    = pendente && cobertura.coberto > 0.005
    const situacao = situacaoDe({ precisa, loading, forcado, conciliado, parcial })
    return { p, i, situacao, coberto: cobertura.coberto }
  }).filter(l => !somenteConciliaveis || l.situacao !== 'livre')
  const ordem: Record<Situacao, number> = { pendente: 0, parcial: 1, carregando: 2, forcado: 3, conciliado: 4, livre: 5 }
  itens.sort((x, y) => ordem[x.situacao] - ordem[y.situacao] || x.i - y.i)

  const conciliaveis = itens.filter(l => l.situacao !== 'livre')
  const totalConc   = conciliaveis.reduce((a, l) => a + l.p.valor, 0)
  const totalOk     = conciliaveis.reduce((a, l) => a + (RESOLVIDA.has(l.situacao) ? l.p.valor : Math.min(l.coberto, l.p.valor)), 0)
  const nPendentes  = itens.filter(l => RESOLVIVEL.has(l.situacao)).length

  return (
    <div className="space-y-3">
      {totalConc > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Conciliado</span>
            <span><b className="tabular-nums">{fmt(totalOk)}</b> <span className="text-muted-foreground">de {fmt(totalConc)}</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (totalOk / totalConc) * 100)}%` }} />
          </div>
          {!loading && (
            <p className="mt-2 text-xs text-muted-foreground">
              {nPendentes > 0 ? `${nPendentes} de ${conciliaveis.length} pagamento${conciliaveis.length > 1 ? 's' : ''} pendente${nPendentes > 1 ? 's' : ''}` : 'Todos os pagamentos estão conciliados'}
            </p>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {itens.map(({ p, i, situacao, coberto }) => {
          const resolvivel = RESOLVIVEL.has(situacao)
          // Sem ação possível para este papel e tipo (ex.: aux_adm com financiamento), a linha não abre.
          const temAcao = podeForcar || (podeBuscar && p.tipo !== 'financiamento')
          const mostraBusca = buscandoIdx === i && podeBuscar && p.tipo !== 'financiamento'
          const aberto = resolvivel && (buscandoIdx === i || forcandoIdx === i)
          const detalhe = [p.operadora, p.parcelas ? `${p.parcelas}x` : '', p.autorizacao ? `#${p.autorizacao}` : ''].filter(Boolean).join(' · ')
          const complemento =
            situacao === 'forcado' && p.conciliadoManual
              ? `${p.conciliadoManual.porNome} · ${new Date(p.conciliadoManual.em).toLocaleDateString('pt-BR')} · ${p.conciliadoManual.motivo}`
              : situacao === 'parcial'
                ? `Entrou ${fmt(coberto)} · faltam ${fmt(p.valor - coberto)}`
                : detalhe
          return (
            <li key={i} className={cn('overflow-hidden rounded-xl border border-l-4 border-border', SITUACAO[situacao].borda, aberto && 'shadow-sm')}>
              <button
                type="button"
                disabled={!resolvivel || !temAcao}
                aria-expanded={resolvivel ? aberto : undefined}
                onClick={() => abrirOuFechar(i, p)}
                className="flex min-h-14 w-full items-center gap-3 p-3 text-left disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{TIPO_LABEL[p.tipo] ?? p.tipo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className={cn('font-medium', SITUACAO[situacao].cor)}>{SITUACAO[situacao].rotulo}</span>
                    {complemento ? ` · ${complemento}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{fmt(p.valor)}</span>
                {resolvivel && temAcao && (
                  <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
                )}
              </button>

              {situacao === 'forcado' && podeForcar && (
                <div className="flex justify-end border-t border-border px-3">
                  <button type="button" onClick={() => desfazer(i)} disabled={salvando} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
                    {salvando && <Loader2 className="size-4 animate-spin" />} Desfazer forçado
                  </button>
                </div>
              )}

              {aberto && (
                <div className="space-y-3 border-t border-border p-3">
                  {forcandoIdx === i ? (
                    <div className="space-y-2 rounded-lg bg-warning/10 p-3">
                      <p className="text-sm font-medium text-warning">Marcar como recebido sem extrato</p>
                      <p className="text-xs text-warning">
                        {p.tipo === 'financiamento'
                          ? 'Use quando o banco já depositou o financiamento. '
                          : 'Use quando o dinheiro entrou de verdade, mas o lançamento não existe aqui. '}
                        Fica registrado com seu nome e o motivo, e pode ser desfeito.
                      </p>
                      <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        // Enter envia, como no diálogo antigo; Shift+Enter quebra linha.
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (motivo.trim().length >= 3) forcar() } }}
                        placeholder="Por que está marcando? Ex.: PIX caiu na conta pessoal"
                        aria-label="Motivo"
                        rows={2}
                        autoFocus
                        className="w-full rounded-md border border-input bg-card p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setForcandoIdx(null)} disabled={salvando} className="h-11 flex-1 rounded-lg border border-input bg-card text-sm font-medium">Voltar</button>
                        <button
                          type="button"
                          onClick={forcar}
                          disabled={salvando || motivo.trim().length < 3}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground text-sm font-medium text-background disabled:opacity-40"
                        >
                          {salvando && <Loader2 className="size-4 animate-spin" />} Marcar como recebido
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {mostraBusca && (
                        <>
                          {buscaLoading ? (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Procurando recebimentos…</p>
                          ) : sugestoes.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                {modo.nome} de valor próximo a <b className="text-foreground">{fmt(p.valor)}</b> ainda sem vínculo:
                              </p>
                              {sugestoes}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {modo.vazio}
                            </p>
                          )}

                          <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type="search"
                              value={buscaLivre}
                              onChange={e => { setBuscaLivre(e.target.value); setBuscouLivre(false) }}
                              onKeyDown={e => e.key === 'Enter' && buscarLivre()}
                              aria-label={modo.procurar}
                              placeholder={modo.placeholder}
                              className="h-11 w-full rounded-lg border border-input bg-card pr-20 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
                              {buscaLivre && (
                                <button type="button" onClick={() => { setBuscaLivre(''); setBuscouLivre(false); setLivres([]); setLivresPix([]) }} aria-label="Limpar busca" className="grid size-9 place-items-center text-muted-foreground hover:text-foreground">
                                  <X className="size-4" />
                                </button>
                              )}
                              <button type="button" onClick={buscarLivre} disabled={livreLoading || buscaLivre.trim().length < 2} className="h-9 rounded-md px-2.5 text-sm font-medium text-primary-text disabled:text-muted-foreground">
                                {livreLoading ? <Loader2 className="size-4 animate-spin" /> : 'Buscar'}
                              </button>
                            </div>
                          </div>

                          {buscouLivre && achadosLivres.length === 0 && <p className="text-sm text-muted-foreground">{modo.nada}</p>}
                          {achadosLivres.length > 0 && <div className="space-y-2">{achadosLivres}</div>}
                        </>
                      )}

                      {podeForcar && (
                        <div className={cn('flex items-center gap-3', mostraBusca && 'border-t border-border pt-3')}>
                          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {p.tipo === 'financiamento'
                              ? 'O banco já depositou? Marque como recebido.'
                              : 'Não achou? Se o dinheiro entrou por outro caminho, marque como recebido.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => { setForcandoIdx(i); setMotivo('') }}
                            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-warning/40 bg-warning/10 px-4 text-sm font-medium text-warning hover:bg-warning/20"
                          >
                            Forçar
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Sugestao({ titulo, detalhes, valor, onVincular, rotulo, vinculando }: { titulo: string; detalhes: string[]; valor: string | number; onVincular: () => void; rotulo: string; vinculando: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{titulo}</p>
        {detalhes.filter(Boolean).map(l => <p key={l} className="truncate text-xs text-muted-foreground">{l}</p>)}
      </div>
      <span className="hidden text-sm tabular-nums sm:block">{fmt(valor)}</span>
      <button
        type="button"
        onClick={onVincular}
        disabled={vinculando}
        aria-label={rotulo}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {vinculando && <Loader2 className="size-4 animate-spin" />} Vincular
      </button>
    </div>
  )
}

type Situacao = 'pendente' | 'parcial' | 'carregando' | 'forcado' | 'conciliado' | 'livre'
const RESOLVIDA  = new Set<Situacao>(['conciliado', 'forcado'])
const RESOLVIVEL = new Set<Situacao>(['pendente', 'parcial'])

// Sem ícone: a situação vem escrita e numa borda à esquerda.
const SITUACAO: Record<Situacao, { rotulo: string; cor: string; borda: string }> = {
  pendente:   { rotulo: 'Pendente',              cor: 'text-destructive',      borda: 'border-l-destructive' },
  parcial:    { rotulo: 'Parcial',               cor: 'text-warning',          borda: 'border-l-warning' },
  carregando: { rotulo: 'Conferindo…',           cor: 'text-muted-foreground', borda: 'border-l-border' },
  forcado:    { rotulo: 'Forçado',               cor: 'text-warning',          borda: 'border-l-warning' },
  conciliado: { rotulo: 'Conciliado',            cor: 'text-primary-text',     borda: 'border-l-primary' },
  livre:      { rotulo: 'Não precisa conciliar', cor: 'text-muted-foreground', borda: 'border-l-border' },
}

// Forçado vem antes do carregamento: é dado do próprio pagamento, não depende dos lançamentos.
function situacaoDe(s: { precisa: boolean; loading: boolean; forcado: boolean; conciliado: boolean; parcial: boolean }): Situacao {
  if (!s.precisa) return 'livre'
  if (s.forcado) return 'forcado'
  if (s.loading) return 'carregando'
  if (s.conciliado) return 'conciliado'
  return s.parcial ? 'parcial' : 'pendente'
}

// Textos da busca: PIX e cartão moram em tabelas diferentes.
const MODO = {
  pix: {
    nome: 'PIX', procurar: 'Procurar outro PIX', nada: 'Nenhum PIX encontrado.',
    placeholder: 'Pagador, descrição, data (AAAA-MM-DD) ou valor',
    vazio: 'Nenhum PIX livre com esse valor por enquanto. Sincronize o Open Finance em /pix-mcp, ou procure por outro valor ou data:',
  },
  cartao: {
    nome: 'Transações', procurar: 'Procurar outra transação', nada: 'Nenhuma transação encontrada.',
    placeholder: 'Autorização, NSU, data (AAAA-MM-DD) ou valor',
    vazio: 'Nenhuma transação com esse valor. Importe o relatório da operadora em /conciliacao, ou procure por outro valor ou data:',
  },
}
