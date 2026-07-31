'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Search, Loader2, Zap, Undo2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TIPOS_CARTAO, matchPagamentos, precisaConciliar, type PgtoOS } from '@/lib/conciliacao-status'
import {
  buscarConciliacoesDoAlvo,
  buscarPixDoAlvo,
  buscarConciliacoesPorValor,
  buscarConciliacoesLivres,
  vincularVendaAction,
  forcarConciliacaoAction,
  desfazerConciliacaoForcadaAction,
  type AlvoConciliacao,
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
  const [candidatos, setCandidatos]     = useState<Candidato[]>([])
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [vinculando, setVinculando]     = useState(false)

  const [buscaLivre, setBuscaLivre]         = useState('')
  const [livres, setLivres]                 = useState<Candidato[]>([])
  const [livreLoading, setLivreLoading]     = useState(false)
  const [buscouLivre, setBuscouLivre]       = useState(false)

  const [forcandoIdx, setForcandoIdx] = useState<number | null>(null)
  const [motivo, setMotivo]           = useState('')
  const [salvando, setSalvando]       = useState(false)

  const conciliados = matchPagamentos(pagamentos, concs, pixRecs)

  async function abrirBusca(idx: number, valor: number) {
    if (buscandoIdx === idx) { setBuscandoIdx(null); return }
    setBuscandoIdx(idx)
    setBuscaLoading(true)
    setCandidatos([])
    setLivres([])
    setBuscaLivre('')
    setBuscouLivre(false)
    try {
      setCandidatos(await buscarConciliacoesPorValor(valor))
    } catch {
      toast.error('Erro ao buscar transações')
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
      setLivres(await buscarConciliacoesLivres(buscaLivre))
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
      setCandidatos([])
      setLivres([])
      toast.success('Pagamento conciliado')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  async function forcar() {
    if (forcandoIdx === null) return
    setSalvando(true)
    try {
      await forcarConciliacaoAction(alvo, forcandoIdx, motivo)
      setForcandoIdx(null)
      setMotivo('')
      toast.success('Conciliação forçada')
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

  function renderCandidato(c: Candidato) {
    const raw = c.rawData as { bandeira?: string; portador?: string } | null
    return (
      <button
        key={c.id}
        onClick={() => vincular(c.id)}
        disabled={vinculando}
        className="w-full text-left rounded px-2.5 py-2 bg-white border border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors text-xs disabled:opacity-50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-slate-800">
              {OPERADORA_LABEL[c.operadora] ?? c.operadora}
              {raw?.bandeira ? ` · ${raw.bandeira}` : ''}
              {c.tipo === 'debito' ? ' (Débito)' : ' (Crédito)'}
            </p>
            {raw?.portador && (
              <p className="text-slate-700 font-medium">
                Portador: <span className="font-normal">{raw.portador}</span>
              </p>
            )}
            <p className="text-slate-400 font-mono">
              {c.autorizacao ? `Aut: #${c.autorizacao}` : 'Sem autorização'}
              {' · '}
              {c.dataTransacao ? new Date(c.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
          <div className="flex items-center gap-1 text-blue-600 shrink-0 mt-0.5">
            {vinculando ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
            <span className="font-semibold">{fmt(c.valorBruto)}</span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-1.5">
      {pagamentos.map((p, i) => {
        const precisa = precisaConciliar(p.tipo)
        if (somenteConciliaveis && !precisa) return null

        const forcado    = Boolean(p.conciliadoManual)
        const conciliado = precisa && conciliados[i]
        const pendente   = precisa && !loading && !conciliados[i]
        const aberto     = buscandoIdx === i

        return (
          <div key={i} className="space-y-1">
            <div
              className={`flex justify-between items-center rounded px-3 py-2 ${
                conciliado ? 'bg-green-50 border border-green-200' :
                pendente   ? 'bg-red-50 border border-red-200' :
                             'bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {precisa && (
                  loading
                    ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
                    : conciliado
                      ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                      : <Clock size={13} className="text-red-400 shrink-0" />
                )}
                <span className={`truncate ${conciliado ? 'text-green-800' : pendente ? 'text-red-700' : 'text-slate-600'}`}>
                  {TIPO_LABEL[p.tipo] ?? p.tipo}
                  {p.operadora ? ` (${p.operadora})` : ''}
                  {p.parcelas  ? ` ${p.parcelas}x`  : ''}
                  {p.autorizacao
                    ? <span className="ml-1 font-mono text-xs opacity-60">#{p.autorizacao}</span>
                    : null}
                </span>
                {forcado && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                    forçado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className={`font-medium tabular-nums ${conciliado ? 'text-green-700' : ''}`}>
                  {fmt(p.valor)}
                </span>

                {podeBuscar && pendente && TIPOS_CARTAO.has(p.tipo) && (
                  <button
                    onClick={() => abrirBusca(i, p.valor)}
                    title="Buscar transação para conciliar"
                    className={`p-1 rounded transition-colors ${
                      aberto ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    <Search size={13} />
                  </button>
                )}

                {podeForcar && pendente && !forcado && (
                  <button
                    onClick={() => { setForcandoIdx(i); setMotivo('') }}
                    title="Forçar conciliação deste pagamento"
                    className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    <Zap size={13} />
                  </button>
                )}

                {podeForcar && forcado && (
                  <button
                    onClick={() => desfazer(i)}
                    disabled={salvando}
                    title="Desfazer conciliação forçada"
                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {salvando ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                  </button>
                )}
              </div>
            </div>

            {forcado && p.conciliadoManual && (
              <p className="text-xs text-amber-700 ml-3">
                Conciliado na mão por {p.conciliadoManual.porNome} em{' '}
                {new Date(p.conciliadoManual.em).toLocaleDateString('pt-BR')} — {p.conciliadoManual.motivo}
              </p>
            )}

            {aberto && (
              <div className="ml-4 border border-blue-100 rounded-lg bg-blue-50 p-2 space-y-1">
                <p className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
                  <Search size={11} />
                  Transações com valor próximo não vinculadas
                </p>

                {buscaLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 py-1">
                    <Loader2 size={12} className="animate-spin" />
                    Buscando…
                  </div>
                )}

                {!buscaLoading && candidatos.length === 0 && (
                  <p className="text-xs text-slate-500 py-1">
                    Nenhuma transação com este valor. Importe o relatório da operadora em /conciliação
                    ou procure abaixo.
                  </p>
                )}

                {!buscaLoading && candidatos.map(renderCandidato)}

                {/* Busca livre — quando o valor não bate com nada */}
                <div className="border-t border-blue-100 pt-2 mt-2">
                  <p className="text-xs font-medium text-blue-700 mb-1.5">
                    Procurar outra transação
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={buscaLivre}
                      onChange={e => { setBuscaLivre(e.target.value); setBuscouLivre(false) }}
                      onKeyDown={e => e.key === 'Enter' && buscarLivre()}
                      placeholder="Autorização, NSU, data (AAAA-MM-DD) ou valor"
                      className="flex-1 border border-blue-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={buscarLivre}
                      disabled={livreLoading || buscaLivre.trim().length < 2}
                      className="h-7 px-2"
                    >
                      {livreLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    </Button>
                  </div>

                  {buscouLivre && livres.length === 0 && (
                    <p className="text-xs text-slate-500 mt-1.5">Nenhuma transação encontrada.</p>
                  )}

                  {livres.length > 0 && (
                    <div className="mt-1.5 space-y-1">{livres.map(renderCandidato)}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Dialog de forçar */}
      <Dialog open={forcandoIdx !== null} onOpenChange={o => { if (!o) setForcandoIdx(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forçar conciliação</DialogTitle>
            <p className="text-sm text-slate-500">
              {forcandoIdx !== null && pagamentos[forcandoIdx] && (
                <>
                  {TIPO_LABEL[pagamentos[forcandoIdx].tipo] ?? pagamentos[forcandoIdx].tipo}
                  {' — '}
                  <span className="font-semibold">{fmt(pagamentos[forcandoIdx].valor)}</span>
                </>
              )}
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Marca este pagamento como conciliado sem transação correspondente no sistema.
              Use quando o dinheiro entrou de verdade mas o lançamento não existe aqui.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Motivo
              </label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && motivo.trim().length >= 3 && forcar()}
                placeholder="Ex.: PIX caiu na conta pessoal"
                autoFocus
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForcandoIdx(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={forcar}
                disabled={salvando || motivo.trim().length < 3}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {salvando ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Zap size={13} className="mr-1.5" />}
                Forçar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
