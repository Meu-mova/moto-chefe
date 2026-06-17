import { Suspense } from 'react'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { listarDadosCompras } from '@/lib/queries/compras'
import type { ItemCompra, GrupoCompra } from '@/lib/queries/compras'
import { LojaFilter } from './components/loja-filter'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Package, ShoppingBag, TrendingUp } from 'lucide-react'

const ADMINS = ['admin_geral', 'admin_socio']

// ─── Urgência helpers ────────────────────────────────────────────────────────

const urgenciaRowBg: Record<ItemCompra['urgencia'], string> = {
  critico:   'bg-red-50',
  atencao:   'bg-amber-50',
  ok:        '',
  sem_saida: '',
}

const urgenciaCoberturaClass: Record<ItemCompra['urgencia'], string> = {
  critico:   'text-red-600 font-semibold',
  atencao:   'text-amber-600 font-medium',
  ok:        'text-green-700',
  sem_saida: 'text-slate-400',
}

function UrgenciaBadge({ urgencia }: { urgencia: ItemCompra['urgencia'] }) {
  if (urgencia === 'critico')   return <Badge variant="destructive" className="text-xs">Crítico</Badge>
  if (urgencia === 'atencao')   return <Badge variant="outline"     className="text-xs border-amber-300 text-amber-700 bg-amber-50">Atenção</Badge>
  if (urgencia === 'ok')        return <Badge variant="outline"     className="text-xs border-green-300 text-green-700 bg-green-50">OK</Badge>
  return                               <Badge variant="secondary"   className="text-xs text-slate-400">Sem saída</Badge>
}

function GrupoUrgenciaBadge({ urgencia }: { urgencia: ItemCompra['urgencia'] }) {
  if (urgencia === 'critico')   return <span className="text-xs font-medium text-red-600">● Crítico</span>
  if (urgencia === 'atencao')   return <span className="text-xs font-medium text-amber-600">● Atenção</span>
  if (urgencia === 'ok')        return <span className="text-xs font-medium text-green-600">● OK</span>
  return null
}

function formatCobertura(dias: number, urgencia: ItemCompra['urgencia']) {
  if (!isFinite(dias)) return '—'
  return `${Math.round(dias)}d`
}

// ─── Grupo card ──────────────────────────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: GrupoCompra }) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Cabeçalho do modelo */}
      <div className="bg-slate-50 px-4 py-3 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm text-slate-900 truncate">
            {grupo.marca} {grupo.modelo}
          </span>
          <GrupoUrgenciaBadge urgencia={grupo.piorUrgencia} />
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500 shrink-0">
          <span>Estoque: <strong className="text-slate-700">{grupo.totalEstoque}</strong></span>
          <span>Vendas 15d: <strong className="text-slate-700">{grupo.totalVendas15d}</strong></span>
          {grupo.totalSugerido > 0 && (
            <span className="text-blue-700 font-medium">
              Pedir: <strong>{grupo.totalSugerido} un.</strong>
            </span>
          )}
        </div>
      </div>

      {/* Tabela de cores */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-slate-400 font-medium">
            <th className="text-left px-4 py-2">Cor</th>
            <th className="text-right px-4 py-2">Estoque</th>
            <th className="text-right px-4 py-2">Vendas 15d</th>
            <th className="text-right px-4 py-2">Cobertura</th>
            <th className="text-right px-4 py-2">Sugerido</th>
            <th className="text-center px-4 py-2 w-28">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grupo.items.map(item => (
            <tr key={item.cor} className={urgenciaRowBg[item.urgencia]}>
              <td className="px-4 py-2.5 font-medium text-slate-800">{item.cor}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{item.estoque}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{item.vendas15d}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${urgenciaCoberturaClass[item.urgencia]}`}>
                {formatCobertura(item.diasCobertura, item.urgencia)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {item.sugerido > 0
                  ? <span className="font-semibold text-blue-700">{item.sugerido}</span>
                  : <span className="text-slate-300">—</span>
                }
              </td>
              <td className="px-4 py-2.5 text-center">
                <UrgenciaBadge urgencia={item.urgencia} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojaFiltro = isAdmin
    ? params.loja
    : (usuario.lojaId ?? undefined)

  const [grupos, lojasOpts] = await Promise.all([
    listarDadosCompras(lojaFiltro),
    isAdmin
      ? db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome)
      : Promise.resolve([]),
  ])

  // Métricas de resumo
  const allItems = grupos.flatMap(g => g.items)
  const totalCombos   = allItems.length
  const criticos      = allItems.filter(i => i.urgencia === 'critico').length
  const totalSugerido = allItems.reduce((s, i) => s + i.sugerido, 0)
  const comSaida      = allItems.filter(i => i.vendas15d > 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Compras</h1>
          <p className="text-slate-500 text-sm">
            Sugestão de reposição — estoque atual vs. vendas dos últimos 15 dias
          </p>
        </div>
        {isAdmin && (
          <Suspense>
            <LojaFilter lojas={lojasOpts} current={params.loja} />
          </Suspense>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Modelos monitorados</span>
            <Package size={14} className="text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-700">{totalCombos}</p>
          <p className="text-xs text-slate-400 mt-1">{comSaida} com saída recente</p>
        </div>

        <div className={`rounded-xl border px-4 py-3 ${criticos > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Estoque crítico</span>
            <AlertTriangle size={14} className={criticos > 0 ? 'text-red-400' : 'text-slate-400'} />
          </div>
          <p className={`text-2xl font-bold ${criticos > 0 ? 'text-red-700' : 'text-slate-700'}`}>{criticos}</p>
          <p className="text-xs text-slate-400 mt-1">cobertura &lt; 7 dias</p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Total a pedir</span>
            <ShoppingBag size={14} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-700">{totalSugerido}</p>
          <p className="text-xs text-slate-400 mt-1">unidades sugeridas</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Meta de cobertura</span>
            <TrendingUp size={14} className="text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-700">30d</p>
          <p className="text-xs text-slate-400 mt-1">baseado em vendas 15d × 2</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Cobertura:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
          Crítico (&lt; 7 dias)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          Atenção (7–14 dias)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
          OK (≥ 15 dias)
        </span>
        <span className="text-slate-400">· Sugerido = vendas 15d × 2 − estoque atual</span>
      </div>

      {/* Grupos por modelo */}
      {grupos.length === 0 ? (
        <p className="text-center text-slate-400 py-16">
          Nenhum dado encontrado para os filtros aplicados.
        </p>
      ) : (
        <div className="space-y-4">
          {grupos.map(g => (
            <GrupoCard key={g.modeloId} grupo={g} />
          ))}
        </div>
      )}
    </div>
  )
}
