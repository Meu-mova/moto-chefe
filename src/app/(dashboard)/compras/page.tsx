import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarDadosCompras } from '@/lib/queries/compras'
import type { ItemCompra, GrupoCompra } from '@/lib/queries/compras'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { LojaFilter } from './components/loja-filter'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Package, ShoppingBag, TrendingUp } from 'lucide-react'

const ADMINS = ['admin_geral', 'admin_socio']

// ─── Urgência helpers ────────────────────────────────────────────────────────

const urgenciaRowBg: Record<ItemCompra['urgencia'], string> = {
  critico:   'bg-destructive/10',
  atencao:   'bg-warning/10',
  ok:        '',
  sem_saida: '',
}

const urgenciaCoberturaClass: Record<ItemCompra['urgencia'], string> = {
  critico:   'text-destructive font-semibold',
  atencao:   'text-warning font-medium',
  ok:        'text-success',
  sem_saida: 'text-muted-foreground',
}

function UrgenciaBadge({ urgencia }: { urgencia: ItemCompra['urgencia'] }) {
  if (urgencia === 'critico')   return <Badge variant="destructive" className="text-xs">Crítico</Badge>
  if (urgencia === 'atencao')   return <Badge variant="outline"     className="text-xs border-warning/50 text-warning bg-warning/10">Atenção</Badge>
  if (urgencia === 'ok')        return <Badge variant="outline"     className="text-xs border-success/50 text-success bg-success/10">OK</Badge>
  return                               <Badge variant="secondary"   className="text-xs text-muted-foreground">Sem saída</Badge>
}

function GrupoUrgenciaBadge({ urgencia }: { urgencia: ItemCompra['urgencia'] }) {
  if (urgencia === 'critico')   return <span className="text-xs font-medium text-destructive">● Crítico</span>
  if (urgencia === 'atencao')   return <span className="text-xs font-medium text-warning">● Atenção</span>
  if (urgencia === 'ok')        return <span className="text-xs font-medium text-success">● OK</span>
  return null
}

function formatCobertura(dias: number, urgencia: ItemCompra['urgencia']) {
  if (!isFinite(dias)) return '—'
  return `${Math.round(dias)}d`
}

// ─── Grupo card ──────────────────────────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: GrupoCompra }) {
  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      {/* Cabeçalho do modelo */}
      <div className="bg-muted px-4 py-3 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm text-foreground truncate">
            {grupo.marca} {grupo.modelo}
          </span>
          <GrupoUrgenciaBadge urgencia={grupo.piorUrgencia} />
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground shrink-0">
          <span>Estoque: <strong className="text-foreground">{grupo.totalEstoque}</strong></span>
          <span>Vendas 15d: <strong className="text-foreground">{grupo.totalVendas15d}</strong></span>
          {grupo.totalSugerido > 0 && (
            <span className="text-info font-medium">
              Pedir: <strong>{grupo.totalSugerido} un.</strong>
            </span>
          )}
        </div>
      </div>

      {/* Tabela de cores */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground font-medium">
            <th className="text-left px-4 py-2">Cor</th>
            <th className="text-right px-4 py-2">Estoque</th>
            <th className="text-right px-4 py-2">Vendas 15d</th>
            <th className="text-right px-4 py-2">Cobertura</th>
            <th className="text-right px-4 py-2">Sugerido</th>
            <th className="text-center px-4 py-2 w-28">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {grupo.items.map(item => (
            <tr key={item.cor} className={urgenciaRowBg[item.urgencia]}>
              <td className="px-4 py-2.5 font-medium text-foreground">{item.cor}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{item.estoque}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{item.vendas15d}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${urgenciaCoberturaClass[item.urgencia]}`}>
                {formatCobertura(item.diasCobertura, item.urgencia)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {item.sugerido > 0
                  ? <span className="font-semibold text-info">{item.sugerido}</span>
                  : <span className="text-muted-foreground">—</span>
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
  if (!usuarioPodeAcessar(usuario, '/compras')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : (usuario.lojaId ? [usuario.lojaId] : [])
  const lojaParamValido = isAdmin && params.loja && lojaIdsGrupo.includes(params.loja) ? params.loja : undefined

  const lojaFiltro = isAdmin
    ? lojaParamValido
    : (usuario.lojaId ?? undefined)

  const [grupos, lojasOpts] = await Promise.all([
    listarDadosCompras(lojaFiltro, lojaIdsGrupo),
    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),
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
          <p className="text-muted-foreground text-sm">
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
        <div className="rounded-xl border border-border bg-muted px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Modelos monitorados</span>
            <Package size={14} className="text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{totalCombos}</p>
          <p className="text-xs text-muted-foreground mt-1">{comSaida} com saída recente</p>
        </div>

        <div className={`rounded-xl border px-4 py-3 ${criticos > 0 ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Estoque crítico</span>
            <AlertTriangle size={14} className={criticos > 0 ? 'text-destructive' : 'text-muted-foreground'} />
          </div>
          <p className={`text-2xl font-bold ${criticos > 0 ? 'text-destructive' : 'text-foreground'}`}>{criticos}</p>
          <p className="text-xs text-muted-foreground mt-1">cobertura &lt; 7 dias</p>
        </div>

        <div className="rounded-xl border border-info/30 bg-info/10 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Total a pedir</span>
            <ShoppingBag size={14} className="text-info" />
          </div>
          <p className="text-2xl font-bold text-info">{totalSugerido}</p>
          <p className="text-xs text-muted-foreground mt-1">unidades sugeridas</p>
        </div>

        <div className="rounded-xl border border-border bg-muted px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Meta de cobertura</span>
            <TrendingUp size={14} className="text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">30d</p>
          <p className="text-xs text-muted-foreground mt-1">baseado em vendas 15d × 2</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium text-muted-foreground">Cobertura:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block" />
          Crítico (&lt; 7 dias)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />
          Atenção (7–14 dias)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
          OK (≥ 15 dias)
        </span>
        <span className="text-muted-foreground">· Sugerido = vendas 15d × 2 − estoque atual</span>
      </div>

      {/* Grupos por modelo */}
      {grupos.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">
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
