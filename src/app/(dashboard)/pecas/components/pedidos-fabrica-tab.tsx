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
      <div className="flex items-center gap-3">
        <Button onClick={carregar} disabled={loading}>
          <RefreshCw size={16} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando a fábrica...' : 'Carregar pedidos'}
        </Button>
        {resultado && !loading && (
          <span className="text-sm text-slate-500">
            {total} peça(s) · {resultado.length} loja(s) consultada(s)
          </span>
        )}
      </div>

      {!resultado && !loading && (
        <p className="text-sm text-slate-500">
          Peças compradas na fábrica que ainda não foram entregues. Clique em{' '}
          <strong>Carregar pedidos</strong> — a consulta é feita ao vivo no portal e leva alguns segundos por loja.
        </p>
      )}

      {resultado?.map(loja => (
        <div key={loja.lojaId} className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">{loja.loja}</h2>
            {loja.status === 'ok' && (
              <span className="text-xs text-slate-500">
                {loja.itens.length === 0 ? 'sem pedidos em aberto' : `${loja.itens.length} peça(s)`}
              </span>
            )}
          </div>

          {loja.status === 'erro' && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-red-600">
              <AlertTriangle size={15} /> Não foi possível ler esta loja{loja.erro ? ` (${loja.erro})` : ''}.
            </p>
          )}

          {loja.status === 'sem_credencial' && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <KeyRound size={15} /> Sem login da fábrica cadastrado para esta loja.
            </p>
          )}

          {loja.status === 'ok' && loja.itens.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Package2 size={15} /> Nenhum pedido de compra em aberto.
            </p>
          )}

          {loja.status === 'ok' && loja.itens.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
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
                    <tr key={`${item.numeroPedido}-${i}`} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-800">{item.peca}</td>
                      <td className="px-4 py-2 text-slate-600">{item.categoria ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{item.quantidade ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                          {item.status ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{item.tipoEntrega ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">#{item.numeroPedido}</td>
                      <td className="px-4 py-2 text-slate-600">{item.dataPedido?.split(' ')[0] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
