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
          <p className="text-muted-foreground text-sm">Vendas por loja, quantidade e valor · {grupo.nome}</p>
        </div>
        <PrintButton href={`/relatorio-fabrica/imprimir?de=${de}&ate=${ate}`} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-card border rounded-lg p-3">
        <div className="space-y-1">
          <label htmlFor="de" className="text-xs text-muted-foreground block">De</label>
          <input
            type="date" id="de" name="de" defaultValue={de}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-card"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ate" className="text-xs text-muted-foreground block">Até</label>
          <input
            type="date" id="ate" name="ate" defaultValue={ate}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-card"
          />
        </div>
        <button type="submit" className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm">
          Aplicar
        </button>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lojas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{grupos.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Motos vendidas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{totalQtd}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Valor total</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-success">{fmt(totalValor)}</p></CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Loja</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Modelo</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Qtd</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grupos.map(g => [
              ...g.modelos.map((m, i) => (
                <tr key={`${g.lojaId}-${m.modelo}`} className="hover:bg-muted">
                  <td className="px-4 py-2">
                    {i === 0 && <p className="font-medium">{g.lojaNome}</p>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.modelo} <span className="text-xs text-muted-foreground">{m.marca}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{m.quantidade}</td>
                  <td className="px-4 py-2 text-right">{fmt(m.valor)}</td>
                </tr>
              )),
              <tr key={`${g.lojaId}-subtotal`} className="bg-muted/70 border-t">
                <td className="px-4 py-1.5 text-xs text-muted-foreground" colSpan={2}>Total {g.lojaNome}</td>
                <td className="px-4 py-1.5 text-right font-semibold">{g.quantidade}</td>
                <td className="px-4 py-1.5 text-right font-semibold">{fmt(g.valor)}</td>
              </tr>,
            ])}
            {grupos.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma venda no período.</td></tr>
            )}
          </tbody>
          {grupos.length > 0 && (
            <tfoot className="border-t-2 bg-muted">
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
        <p className="text-xs text-muted-foreground">
          Não entram neste relatório: {lojasForaNoGrupo.map(l => l.nome).join(', ')}.
        </p>
      )}
    </div>
  )
}
