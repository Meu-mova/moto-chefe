'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Search, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buscarConciliacoesDaOS,
  buscarPixDaOS,
  buscarConciliacoesPorValor,
  vincularVendaAction,
} from '../../../conciliacao/actions'
import { TIPOS_CARTAO, matchPagamentos, type PgtoOS } from '@/lib/conciliacao-status'

type Conc      = Awaited<ReturnType<typeof buscarConciliacoesDaOS>>[number]
type PixRec    = Awaited<ReturnType<typeof buscarPixDaOS>>[number]
type Candidato = Awaited<ReturnType<typeof buscarConciliacoesPorValor>>[number]

type Props = { osId: string; osNumero: number | null; pagamentos: PgtoOS[]; isAdmin: boolean }

const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
  cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
}
const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito', link_pagamento: 'Link de Pagamento',
}
const fmt = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OSConciliacaoPanel({ osId, osNumero, pagamentos, isAdmin }: Props) {
  const temCartao = pagamentos.some(p => TIPOS_CARTAO.has(p.tipo))
  const temPix    = pagamentos.some(p => p.tipo === 'pix')

  const [loading, setLoading]           = useState(true)
  const [concs, setConcs]               = useState<Conc[]>([])
  const [pixRecs, setPixRecs]           = useState<PixRec[]>([])
  const [buscandoIdx, setBuscandoIdx]   = useState<number | null>(null)
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [candidatos, setCandidatos]     = useState<Candidato[]>([])
  const [vinculando, setVinculando]     = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [c, px] = await Promise.all([
        temCartao ? buscarConciliacoesDaOS(osId) : Promise.resolve([]),
        temPix    ? buscarPixDaOS(osId)          : Promise.resolve([]),
      ])
      setConcs(c)
      setPixRecs(px)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (temCartao || temPix) carregar()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osId])

  if (!temCartao && !temPix) return null // dinheiro/transferência/cortesia/gratuita — não precisa conciliar

  const conciliados = matchPagamentos(pagamentos, concs, pixRecs)

  async function buscarCandidatos(idx: number, valor: number) {
    if (buscandoIdx === idx) { setBuscandoIdx(null); return }
    setBuscandoIdx(idx)
    setBuscaLoading(true)
    setCandidatos([])
    try {
      setCandidatos(await buscarConciliacoesPorValor(valor))
    } catch {
      toast.error('Erro ao buscar transações')
      setBuscandoIdx(null)
    } finally {
      setBuscaLoading(false)
    }
  }

  async function vincular(conciliacaoId: string) {
    setVinculando(true)
    try {
      await vincularVendaAction(conciliacaoId, osId, 'os')
      await carregar()
      setBuscandoIdx(null)
      setCandidatos([])
      toast.success('Pagamento conciliado')
    } catch {
      toast.error('Erro ao vincular')
    } finally {
      setVinculando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Conciliação</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {pagamentos.map((p, i) => {
          const precisaConc = TIPOS_CARTAO.has(p.tipo) || p.tipo === 'pix'
          if (!precisaConc) return null

          const conciliado = conciliados[i]
          const pendente   = !loading && !conciliado
          const aberto     = buscandoIdx === i

          return (
            <div key={i} className="space-y-1">
              <div className={`flex justify-between items-center rounded px-3 py-2 ${
                loading ? 'bg-slate-50' : conciliado ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  {loading
                    ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
                    : conciliado
                      ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                      : <Clock size={13} className="text-red-400 shrink-0" />}
                  <span className={`truncate ${conciliado ? 'text-green-800' : 'text-red-700'}`}>
                    {TIPO_LABEL[p.tipo] ?? p.tipo}
                    {p.operadora ? ` (${p.operadora})` : ''}
                    {p.parcelas  ? ` ${p.parcelas}x`  : ''}
                    {!loading && (conciliado ? ' — conciliado' : ' — pendente')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="font-medium tabular-nums">{fmt(p.valor)}</span>
                  {isAdmin && pendente && TIPOS_CARTAO.has(p.tipo) && (
                    <button
                      onClick={() => buscarCandidatos(i, p.valor)}
                      title="Buscar transação para conciliar"
                      className={`p-1 rounded transition-colors ${
                        aberto ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      <Search size={13} />
                    </button>
                  )}
                </div>
              </div>

              {p.tipo === 'pix' && pendente && (
                <p className="text-xs text-slate-500">
                  PIX conciliado à parte — vá em <Link href="/pix-mcp" className="text-blue-600 hover:underline">PIX</Link>, busque a OS #{osNumero ?? '—'} e lance a correspondência.
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
                      Nenhuma transação encontrada com este valor. Importe o relatório da operadora no módulo de conciliação.
                    </p>
                  )}

                  {!buscaLoading && candidatos.map(c => {
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
                            {vinculando
                              ? <Loader2 size={11} className="animate-spin" />
                              : null}
                            <span className="font-semibold">{fmt(c.valorBruto)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
