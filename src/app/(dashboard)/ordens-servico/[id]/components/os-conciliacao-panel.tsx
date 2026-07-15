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

type Conc      = Awaited<ReturnType<typeof buscarConciliacoesDaOS>>[number]
type PixRec    = Awaited<ReturnType<typeof buscarPixDaOS>>[number]
type Candidato = Awaited<ReturnType<typeof buscarConciliacoesPorValor>>[number]

type Props = { osId: string; osNumero: number | null; formaPagamento: string; valorTotal: number; isAdmin: boolean }

const FORMAS_CARTAO = new Set(['Cartão de Crédito', 'Cartão de Débito'])
const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay', stone: 'Stone', pagueveloz: 'PaguéVeloz',
  cielo: 'Cielo', getnet: 'GetNet', redecard: 'Redecard',
}
const fmt = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OSConciliacaoPanel({ osId, osNumero, formaPagamento, valorTotal, isAdmin }: Props) {
  const ehCartao = FORMAS_CARTAO.has(formaPagamento)
  const ehPix    = formaPagamento === 'PIX'

  const [loading, setLoading]         = useState(true)
  const [concs, setConcs]             = useState<Conc[]>([])
  const [pixRecs, setPixRecs]         = useState<PixRec[]>([])
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [candidatos, setCandidatos]   = useState<Candidato[]>([])
  const [vinculando, setVinculando]   = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const [c, px] = await Promise.all([
        ehCartao ? buscarConciliacoesDaOS(osId) : Promise.resolve([]),
        ehPix    ? buscarPixDaOS(osId)          : Promise.resolve([]),
      ])
      setConcs(c)
      setPixRecs(px)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ehCartao || ehPix) carregar()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osId])

  if (!ehCartao && !ehPix) return null // dinheiro/transferência/cortesia — não precisa conciliar

  const conciliado = ehCartao ? concs.length > 0 : pixRecs.length > 0

  async function buscarCandidatos() {
    const abrir = !buscaAberta
    setBuscaAberta(abrir)
    if (!abrir) return
    setBuscaLoading(true)
    try {
      setCandidatos(await buscarConciliacoesPorValor(valorTotal))
    } finally {
      setBuscaLoading(false)
    }
  }

  async function vincular(conciliacaoId: string) {
    setVinculando(true)
    try {
      await vincularVendaAction(conciliacaoId, osId, 'os')
      await carregar()
      setBuscaAberta(false)
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
        <div className={`flex justify-between items-center rounded px-3 py-2 ${
          loading ? 'bg-slate-50' : conciliado ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {loading
              ? <Clock size={13} className="text-slate-300 animate-pulse shrink-0" />
              : conciliado
                ? <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                : <Clock size={13} className="text-red-400 shrink-0" />}
            <span className={conciliado ? 'text-green-800' : 'text-red-700'}>
              {ehCartao ? 'Cartão' : 'PIX'}{!loading && (conciliado ? ' — conciliado' : ' — pendente')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-medium tabular-nums">{fmt(valorTotal)}</span>
            {isAdmin && ehCartao && !conciliado && !loading && (
              <button
                onClick={buscarCandidatos}
                title="Buscar transação para conciliar"
                className={`p-1 rounded transition-colors ${
                  buscaAberta ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                <Search size={13} />
              </button>
            )}
          </div>
        </div>

        {ehPix && !conciliado && !loading && (
          <p className="text-xs text-slate-500">
            PIX conciliado à parte — vá em <Link href="/pix-mcp" className="text-blue-600 hover:underline">PIX</Link>, busque a OS #{osNumero ?? '—'} e lance a correspondência.
          </p>
        )}

        {buscaAberta && (
          <div className="border border-blue-100 rounded-lg bg-blue-50 p-2 space-y-1">
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
                      <p className="text-slate-500">
                        {new Date(c.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {c.autorizacao ? ` · Aut. ${c.autorizacao}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">{fmt(c.valorBruto)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
