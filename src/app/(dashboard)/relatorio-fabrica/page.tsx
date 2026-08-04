import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { vendas, motos, modelos, lojas } from '@/lib/db/schema'
import { eq, inArray, and, gte, lt, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LOJAS_FORA_RELATORIO_FABRICA,
  agruparPorLoja,
  type LinhaModeloLoja,
} from '@/lib/relatorio-fabrica'
import { PrintButton } from './print-button'

const PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm']

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function primeiroDiaDoMes(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

// Limites em UTC, de propósito: é a mesma convenção de /financeiro e da Folha de
// Pagamento, então os números batem quando o Cesar confere um contra o outro.
function inicioDoDia(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`)
}
function diaSeguinte(yyyyMmDd: string): Date {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export default async function RelatorioFabricaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaIds = lojaIdsGrupo.filter(id => !LOJAS_FORA_RELATORIO_FABRICA.includes(id))

  const params = await searchParams
  const de = /^\d{4}-\d{2}-\d{2}$/.test(params.de ?? '') ? params.de! : primeiroDiaDoMes()
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(params.ate ?? '') ? params.ate! : hoje()

  const linhas: LinhaModeloLoja[] = lojaIds.length === 0 ? [] : await db
    .select({
      modeloId:   modelos.id,
      marca:      modelos.marca,
      modelo:     modelos.modelo,
      lojaId:     lojas.id,
      lojaNome:   lojas.nome,
      quantidade: sql<number>`COUNT(*)::int`,
      valor:      sql<number>`COALESCE(SUM(${vendas.valor}::numeric), 0)::float8`,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, inicioDoDia(de)),
      lt(vendas.dataVenda, diaSeguinte(ate)),
    ))
    .groupBy(modelos.id, modelos.marca, modelos.modelo, lojas.id, lojas.nome)

  const grupos = agruparPorLoja(linhas)
  const totalQtd = grupos.reduce((s, g) => s + g.quantidade, 0)
  const totalValor = grupos.reduce((s, g) => s + g.valor, 0)

  const lojasForaNoGrupo = await db
    .select({ nome: lojas.nome })
    .from(lojas)
    .where(and(
      inArray(lojas.id, lojaIdsGrupo.filter(id => LOJAS_FORA_RELATORIO_FABRICA.includes(id))),
    ))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Vendas — Fábrica</h1>
          <p className="text-slate-500 text-sm">Vendas por loja, quantidade e valor · {grupo.nome}</p>
        </div>
        <PrintButton />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-3 print:hidden">
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

      {/* Cabeçalho que só aparece no papel */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Relatório de Vendas — {grupo.nome}</h1>
        <p className="text-sm">
          Período: {new Date(`${de}T12:00:00Z`).toLocaleDateString('pt-BR')} a{' '}
          {new Date(`${ate}T12:00:00Z`).toLocaleDateString('pt-BR')}
        </p>
      </div>

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
