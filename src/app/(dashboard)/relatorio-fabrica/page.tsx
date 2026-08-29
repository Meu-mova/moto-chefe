import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { carregarRelatorioFabrica } from '@/lib/queries/relatorio-fabrica'
import { PrintButton } from './print-button'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function RelatorioFabricaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/relatorio-fabrica')) redirect('/dashboard')

  const params = await searchParams
  const { de, ate, grupo, grupos, totalQtd, totalValor, lojasForaNoGrupo } =
    await carregarRelatorioFabrica(usuario, params.de, params.ate)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Vendas — Fábrica</h1>
          <p className="text-slate-500 text-sm">Vendas por loja, quantidade e valor · {grupo.nome}</p>
        </div>
        <PrintButton href={`/relatorio-fabrica/imprimir?de=${de}&ate=${ate}`} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-3">
        <div className="space-y-1">
          <label htmlFor="de" className="text-xs text-slate-500 block">De</label>
          <input
            type="date" id="de" name="de" defaultValue={de}
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ate" className="text-xs text-slate-500 block">Até</label>
          <input
            type="date" id="ate" name="ate" defaultValue={ate}
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <button type="submit" className="h-9 px-4 rounded-md bg-slate-900 text-white text-sm">
          Aplicar
        </button>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lojas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{grupos.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Motos vendidas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{totalQtd}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Valor total</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-emerald-700">{fmt(totalValor)}</p></CardContent>
        </Card>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Loja</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Modelo</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Qtd</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grupos.map(g => [
              ...g.modelos.map((m, i) => (
                <tr key={`${g.lojaId}-${m.modelo}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {i === 0 && <p className="font-medium">{g.lojaNome}</p>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.modelo} <span className="text-xs text-slate-400">{m.marca}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{m.quantidade}</td>
                  <td className="px-4 py-2 text-right">{fmt(m.valor)}</td>
                </tr>
              )),
              <tr key={`${g.lojaId}-subtotal`} className="bg-slate-50/70 border-t">
                <td className="px-4 py-1.5 text-xs text-slate-500" colSpan={2}>Total {g.lojaNome}</td>
                <td className="px-4 py-1.5 text-right font-semibold">{g.quantidade}</td>
                <td className="px-4 py-1.5 text-right font-semibold">{fmt(g.valor)}</td>
              </tr>,
            ])}
            {grupos.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-400 py-8">Nenhuma venda no período.</td></tr>
            )}
          </tbody>
          {grupos.length > 0 && (
            <tfoot className="border-t-2 bg-slate-100">
              <tr>
                <td className="px-4 py-2 font-semibold" colSpan={2}>Total geral</td>
                <td className="px-4 py-2 text-right font-bold">{totalQtd}</td>
                <td className="px-4 py-2 text-right font-bold">{fmt(totalValor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {lojasForaNoGrupo.length > 0 && (
        <p className="text-xs text-slate-400">
          Não entram neste relatório: {lojasForaNoGrupo.map(l => l.nome).join(', ')}.
        </p>
      )}
    </div>
  )
}
