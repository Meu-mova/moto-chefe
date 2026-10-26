'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, Package2, AlertTriangle, KeyRound, Printer } from 'lucide-react'
import { listarPecasSeparadasAction, type LojaPecasSeparadas } from '../actions'
import { AreaImpressao } from './area-impressao'

export function PecasFabricaClient({ grupo }: { grupo: string }) {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<LojaPecasSeparadas[] | null>(null)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroLoja, setFiltroLoja] = useState('')

  async function sincronizar() {
    setLoading(true)
    try {
      const res = await listarPecasSeparadasAction()
      setResultado(res)
      // Filtro velho apontando pra uma loja que não veio nesta leitura esconderia
      // tudo sem explicação — cada sincronização começa do zero.
      setFiltroStatus('')
      setFiltroLoja('')
      const total = res.reduce((s, l) => s + l.pecas.length, 0)
      const comErro = res.filter(l => l.status === 'erro')
      if (comErro.length > 0) {
        toast.warning(`${total} peça(s) para retirar · falha ao ler: ${comErro.map(l => l.loja).join(', ')}`)
      } else if (total === 0) {
        toast.info('Nenhuma peça pronta para retirada no momento')
      } else {
        toast.success(`${total} peça(s) pronta(s) para retirada`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao consultar a fábrica')
    } finally {
      setLoading(false)
    }
  }

  // Sai do que veio, não de uma lista fixa: se a fábrica criar outro rótulo de
  // pronto-para-retirar, ele aparece no filtro em vez de sumir da tela.
  const statusDisponiveis = useMemo(() => {
    const vistos = new Set<string>()
    for (const l of resultado ?? []) for (const p of l.pecas) vistos.add(p.status)
    return [...vistos].sort()
  }, [resultado])

  const filtradas = useMemo(() => {
    if (!resultado) return null
    return resultado
      .filter(l => !filtroLoja || l.lojaId === filtroLoja)
      .map(l => ({
        ...l,
        pecas: filtroStatus ? l.pecas.filter(p => p.status === filtroStatus) : l.pecas,
      }))
  }, [resultado, filtroStatus, filtroLoja])

  const totalPecas = filtradas?.reduce((s, l) => s + l.pecas.length, 0) ?? 0
  const comPecas = filtradas?.filter(l => l.pecas.length > 0) ?? []
  const filtrando = Boolean(filtroStatus || filtroLoja)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={sincronizar} disabled={loading}>
          <RefreshCw size={16} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando a fábrica...' : 'Sincronizar'}
        </Button>

        {resultado && !loading && (
          <>
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-card"
            >
              <option value="">Todos os status</option>
              {statusDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* <select> nativo: o value é uuid e o label é o nome da loja. */}
            <select
              value={filtroLoja}
              onChange={e => setFiltroLoja(e.target.value)}
              className="border border-border rounded-md px-3 py-1.5 text-sm bg-card"
            >
              <option value="">Todas as lojas</option>
              {resultado.map(l => <option key={l.lojaId} value={l.lojaId}>{l.loja}</option>)}
            </select>

            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={totalPecas === 0}
              className="gap-1.5"
            >
              <Printer size={15} />
              Imprimir para a fábrica
            </Button>

            <span className="text-sm text-muted-foreground">
              {totalPecas} peça(s) para retirar
              {filtrando ? ' (filtrado)' : ` · ${resultado.length} loja(s) consultada(s)`}
            </span>
          </>
        )}
      </div>

      {!resultado && !loading && (
        <p className="text-sm text-muted-foreground">
          Clique em <strong>Sincronizar</strong> para ler as peças separadas e conferidas na fábrica.
        </p>
      )}

      {filtradas?.map(loja => (
        <div key={loja.lojaId} className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted border-b border-border">
            <h2 className="font-semibold text-foreground">{loja.loja}</h2>
            {loja.status === 'ok' && (
              <span className="text-xs text-muted-foreground">
                {loja.pecas.length === 0 ? 'sem peças' : `${loja.pecas.length} peça(s)`}
              </span>
            )}
          </div>

          {loja.status === 'erro' && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
              <AlertTriangle size={15} /> Não foi possível ler esta loja{loja.erro ? ` (${loja.erro})` : ''}.
            </p>
          )}

          {loja.status === 'sem_credencial' && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <KeyRound size={15} /> Sem login da fábrica cadastrado para esta loja.
            </p>
          )}

          {loja.status === 'ok' && loja.pecas.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Package2 size={15} />
              {filtroStatus ? `Nenhuma peça com status "${filtroStatus}".` : 'Nenhuma peça pronta para retirada.'}
            </p>
          )}

          {loja.status === 'ok' && loja.pecas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-2 font-medium">Peça</th>
                    <th className="px-4 py-2 font-medium">Qtd</th>
                    <th className="px-4 py-2 font-medium">Modelo</th>
                    <th className="px-4 py-2 font-medium">Pedido</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loja.pecas.map((p, i) => (
                    <tr key={`${p.numeroPedido}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground">{p.peca}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.quantidade ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.categoria ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">#{p.numeroPedido}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.dataPedido?.split(' ')[0] ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${
                            p.status.toLowerCase() === 'conferido'
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-info/10 text-info border-info/30'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Só as lojas com peça entram no papel — bloco vazio de loja sem retirada
          só gastaria folha na fábrica. */}
      {totalPecas > 0 && (
        <AreaImpressao
          lojas={comPecas}
          grupo={grupo}
          filtroStatus={filtroStatus}
          filtroLoja={filtroLoja}
        />
      )}
    </div>
  )
}
