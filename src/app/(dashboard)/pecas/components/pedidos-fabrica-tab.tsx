'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RefreshCw, Package2, AlertTriangle, KeyRound } from 'lucide-react'
import { listarPedidosCompraFabricaAction, type LojaPedidosFabrica } from '../pedidos-fabrica-action'

/**
 * Conferência do que foi comprado na fábrica e ainda não chegou.
 *
 * Carrega sob demanda (mesmo padrão de /pecas-fabrica): a leitura é ao vivo no
 * portal da fábrica, um login por loja mais um detalhe por pedido em aberto.
 * Carregar junto com a página travaria a aba de vendas por dezenas de segundos.
 */
export function PedidosFabricaTab() {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<LojaPedidosFabrica[] | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const res = await listarPedidosCompraFabricaAction()
      setResultado(res)
      const total = res.reduce((s, l) => s + l.itens.length, 0)
      const comErro = res.filter(l => l.status === 'erro')
      if (comErro.length > 0) {
        toast.warning(`${total} peça(s) em aberto · falha ao ler: ${comErro.map(l => l.loja).join(', ')}`)
      } else if (total === 0) {
        toast.info('Nenhum pedido de compra em aberto na fábrica')
      } else {
        toast.success(`${total} peça(s) em pedidos de compra ainda não entregues`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao consultar a fábrica')
    } finally {
      setLoading(false)
    }
  }

  const total = resultado?.reduce((s, l) => s + l.itens.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Button onClick={carregar} disabled={loading} className="h-10 w-full gap-1.5 sm:w-auto">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando a fábrica...' : 'Carregar pedidos'}
        </Button>
        {resultado && !loading && (
          <span className="text-sm text-muted-foreground">
            {total} peça(s) · {resultado.length} loja(s) consultada(s)
          </span>
        )}
      </div>

      {!resultado && !loading && (
        <p className="text-sm text-muted-foreground">
          Peças compradas na fábrica que ainda não foram entregues. Clique em{' '}
          <strong>Carregar pedidos</strong> — a consulta é feita ao vivo no portal e leva alguns segundos por loja.
        </p>
      )}

      {resultado?.map(loja => (
        <div key={loja.lojaId} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2.5">
            <h2 className="font-semibold">{loja.loja}</h2>
            {loja.status === 'ok' && (
              <span className="text-xs text-muted-foreground">
                {loja.itens.length === 0 ? 'sem pedidos em aberto' : `${loja.itens.length} peça(s)`}
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

          {loja.status === 'ok' && loja.itens.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Package2 size={15} /> Nenhum pedido de compra em aberto.
            </p>
          )}

          {loja.status === 'ok' && loja.itens.length > 0 && (
            <>
              {/* Celular/tablet: um item por linha. */}
              <ul className="divide-y divide-border lg:hidden">
                {loja.itens.map((item, i) => (
                  <li key={`${item.numeroPedido}-${i}`} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium break-words">{item.peca}</p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.status ?? '—'}</span>
                    </div>
                    <p className="text-muted-foreground">
                      Qtd {item.quantidade ?? '—'} · Pedido #{item.numeroPedido} · {item.dataPedido?.split(' ')[0] ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">{[item.categoria, item.tipoEntrega].filter(Boolean).join(' · ') || '—'}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Peça</th>
                      <th className="px-4 py-2 font-medium">Categoria</th>
                      <th className="px-4 py-2 font-medium">Qtd</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Entrega</th>
                      <th className="px-4 py-2 font-medium">Pedido</th>
                      <th className="px-4 py-2 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loja.itens.map((item, i) => (
                      <tr key={`${item.numeroPedido}-${i}`} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium">{item.peca}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.categoria ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.quantidade ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.status ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{item.tipoEntrega ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground">#{item.numeroPedido}</td>
                        <td className="px-4 py-2 text-muted-foreground">{item.dataPedido?.split(' ')[0] ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
