'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, Package2, AlertTriangle, KeyRound } from 'lucide-react'
import { listarPecasSeparadasAction, type LojaPecasSeparadas } from '../actions'

export function PecasFabricaClient() {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<LojaPecasSeparadas[] | null>(null)

  async function sincronizar() {
    setLoading(true)
    try {
      const res = await listarPecasSeparadasAction()
      setResultado(res)
      const total = res.reduce((s, l) => s + l.pecas.length, 0)
      const comErro = res.filter(l => l.status === 'erro')
      if (comErro.length > 0) {
        toast.warning(`${total} peça(s) para retirar · falha ao ler: ${comErro.map(l => l.loja).join(', ')}`)
      } else if (total === 0) {
        toast.info('Nenhuma peça separada para retirada no momento')
      } else {
        toast.success(`${total} peça(s) separada(s) para retirada`)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao consultar a fábrica')
    } finally {
      setLoading(false)
    }
  }

  const totalPecas = resultado?.reduce((s, l) => s + l.pecas.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button onClick={sincronizar} disabled={loading}>
          <RefreshCw size={16} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando a fábrica...' : 'Sincronizar'}
        </Button>
        {resultado && !loading && (
          <span className="text-sm text-slate-500">
            {totalPecas} peça(s) para retirar · {resultado.length} loja(s) consultada(s)
          </span>
        )}
      </div>

      {!resultado && !loading && (
        <p className="text-sm text-slate-500">
          Clique em <strong>Sincronizar</strong> para ler as peças separadas na fábrica.
        </p>
      )}

      {resultado?.map(loja => (
        <div key={loja.lojaId} className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">{loja.loja}</h2>
            {loja.status === 'ok' && (
              <span className="text-xs text-slate-500">
                {loja.pecas.length === 0 ? 'sem peças' : `${loja.pecas.length} peça(s)`}
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

          {loja.status === 'ok' && loja.pecas.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Package2 size={15} /> Nenhuma peça separada para retirada.
            </p>
          )}

          {loja.status === 'ok' && loja.pecas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Peça</th>
                    <th className="px-4 py-2 font-medium">Qtd</th>
                    <th className="px-4 py-2 font-medium">Modelo</th>
                    <th className="px-4 py-2 font-medium">Pedido</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {loja.pecas.map((p, i) => (
                    <tr key={`${p.numeroPedido}-${i}`} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-800">{p.peca}</td>
                      <td className="px-4 py-2 text-slate-600">{p.quantidade ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{p.categoria ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">#{p.numeroPedido}</td>
                      <td className="px-4 py-2 text-slate-600">{p.dataPedido?.split(' ')[0] ?? '—'}</td>
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
