import { Suspense } from 'react'
import { db } from '@/lib/db'
import { lojas, usuarios, conciliacoesCartao } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import {
  getKPIs, getVendasPorDia, getEstoquePorLoja, getVendasPorLoja,
  getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento,
  getOsAbertas, getMotoMaisVendida, getPrecoMedioVendas,
  getRankingVendedores, getRankingLojas, getModelosMaisVendidos,
} from '@/lib/queries/dashboard'
import { DashboardFiltros } from './components/dashboard-filtros'
import { KpiCards } from './components/kpi-cards'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoVendasPorLoja } from './components/charts'
import {
  TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo,
  TabelaOsAbertas, TabelaRankingVendedores, TabelaRankingLojas, TabelaModelosMaisVendidos,
} from './components/tabelas-resumo'
import { SectionErrorBoundary } from './section-error-boundary'

type Filtros = { dataInicio: string; dataFim: string; lojaId?: string[]; vendedorId?: string }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms)),
  ])
}

const getLojasOpts = unstable_cache(
  () => db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
  ['lojas-opts'], { revalidate: 300 },
)
const getVendedoresOpts = unstable_cache(
  () => db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'vendedor')).orderBy(usuarios.nome),
  ['vendedores-opts'], { revalidate: 300 },
)

// ── Seções async ──────────────────────────────────────────────────────────────

async function KpiSection({ filtros, filtrosAnt, papel }: { filtros: Filtros; filtrosAnt: Filtros; papel: string }) {
  const isAdmin = ADMINS.includes(papel)
  const kpiOpts = papel === 'vendedor' ? { useLiquidoValue: true } : undefined
  try {
    const [kpis, kpisAnt, motoMaisVendida, precoMedio, conciliacaoPendentes] = await withTimeout(
      Promise.all([
        getKPIs(filtros, kpiOpts),
        getKPIs(filtrosAnt, kpiOpts),
        getMotoMaisVendida(filtros),
        getPrecoMedioVendas(filtros, kpiOpts),
        isAdmin
          ? db.$count(conciliacoesCartao, eq(conciliacoesCartao.conciliado, false))
          : Promise.resolve(0),
      ]),
      25000,
    )
    return <KpiCards kpis={kpis} kpisAnt={kpisAnt} papel={papel} motoMaisVendida={motoMaisVendida} precoMedio={precoMedio} conciliacaoPendentes={conciliacaoPendentes} />
  } catch (e) {
    console.error('[KpiSection] erro:', e)
    throw e
  }
}

async function GraficosSection({ filtros, isAdmin }: { filtros: Filtros; isAdmin: boolean }) {
  let vendasDia: Awaited<ReturnType<typeof getVendasPorDia>>,
      estoqueLoja: Awaited<ReturnType<typeof getEstoquePorLoja>>,
      vendasLoja: Awaited<ReturnType<typeof getVendasPorLoja>>
  try {
    ;[vendasDia, estoqueLoja, vendasLoja] = await withTimeout(
      Promise.all([
        getVendasPorDia(filtros),
        getEstoquePorLoja(filtros.lojaId),
        isAdmin ? getVendasPorLoja(filtros) : Promise.resolve([] as Awaited<ReturnType<typeof getVendasPorLoja>>),
      ]),
      25000,
    )
  } catch (e) {
    console.error('[GraficosSection] erro:', e)
    throw e
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoVendasPorDia dados={vendasDia} />
        <GraficoEstoquePorLoja dados={estoqueLoja} />
      </div>
      {isAdmin && vendasLoja.length > 0 && <GraficoVendasPorLoja dados={vendasLoja} />}
    </>
  )
}

async function RankingSection({
  filtros, filtrosRanking,
}: { filtros: Filtros; filtrosRanking: { dataInicio: string; dataFim: string } }) {
  let rankingVendedores: Awaited<ReturnType<typeof getRankingVendedores>>,
      rankingLojas: Awaited<ReturnType<typeof getRankingLojas>>,
      modelosMaisVendidos: Awaited<ReturnType<typeof getModelosMaisVendidos>>
  try {
    ;[rankingVendedores, rankingLojas, modelosMaisVendidos] = await withTimeout(
      Promise.all([getRankingVendedores(filtrosRanking), getRankingLojas(filtrosRanking), getModelosMaisVendidos(filtros)]),
      25000,
    )
  } catch (e) {
    console.error('[RankingSection] erro:', e)
    throw e
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
        <TabelaRankingLojas ranking={rankingLojas} />
      </div>
      <TabelaRankingVendedores ranking={rankingVendedores} />
    </>
  )
}

async function TabelasSection({
  filtros, lojaId, mecanicoId,
}: { filtros: Filtros; lojaId?: string[]; mecanicoId?: string }) {
  let ultimasVendas: Awaited<ReturnType<typeof getUltimasVendas>>,
      transfPendentes: Awaited<ReturnType<typeof getTransferenciasPendentes>>,
      garantiasVencendo: Awaited<ReturnType<typeof getGarantiasProxVencimento>>,
      osAbertas: Awaited<ReturnType<typeof getOsAbertas>>
  try {
    ;[ultimasVendas, transfPendentes, garantiasVencendo, osAbertas] = await withTimeout(
      Promise.all([
        getUltimasVendas(filtros),
        getTransferenciasPendentes(lojaId),
        getGarantiasProxVencimento(lojaId),
        getOsAbertas(lojaId, mecanicoId),
      ]),
      25000,
    )
  } catch (e) {
    console.error('[TabelasSection] erro:', e)
    throw e
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaUltimasVendas vendas={ultimasVendas} />
        <TabelaTransferenciasPendentes transferencias={transfPendentes} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaGarantiasVencendo garantias={garantiasVencendo} />
        <TabelaOsAbertas ordens={osAbertas} />
      </div>
    </>
  )
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white border rounded-lg p-4 space-y-2">
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-7 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function SectionSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white border rounded-lg h-48" />
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMINS = ['admin_geral', 'admin_socio']

function getMesAtual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function mesParaDatas(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  return {
    inicio: new Date(ano, mesNum - 1, 1).toISOString().substring(0, 10),
    fim: new Date(ano, mesNum, 0).toISOString().substring(0, 10),
  }
}

function mesAnterior(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  const d = new Date(ano, mesNum - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; loja?: string; vendedor?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)
  const isVendedor = usuario.papel === 'vendedor'

  const mesDefault = getMesAtual()
  const mesSelecionado = params.mes ?? mesDefault
  const { inicio: dataInicio, fim: dataFim } = mesParaDatas(mesSelecionado)
  const { inicio: dataInicioAnt, fim: dataFimAnt } = mesParaDatas(mesAnterior(mesSelecionado))

  const lojaIds: string[] = params.loja
    ? [params.loja]
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])

  const filtros: Filtros = {
    dataInicio,
    dataFim,
    lojaId: lojaIds.length ? lojaIds : undefined,
    vendedorId: isAdmin ? params.vendedor : (isVendedor ? usuario.id : undefined),
  }

  const filtrosAnt: Filtros = {
    dataInicio: dataInicioAnt,
    dataFim: dataFimAnt,
    lojaId: filtros.lojaId,
    vendedorId: filtros.vendedorId,
  }

  const filtrosRanking = { dataInicio, dataFim }
  const mecanicoId = usuario.papel === 'mecanico' ? usuario.id : undefined
  const filtroKey = `${mesSelecionado}-${lojaIds.join(',')}-${filtros.vendedorId ?? ''}`

  const [lojasOpts, vendedoresOpts] = await withTimeout(
    Promise.all([getLojasOpts(), getVendedoresOpts()]),
    8000,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500 text-sm">
            {!isAdmin && usuario.lojaId
              ? `Resumo da loja`
              : 'Resumo da operação'}
          </p>
        </div>
        <DashboardFiltros
          lojas={lojasOpts}
          vendedores={vendedoresOpts}
          isAdmin={isAdmin}
          lojaUsuarioId={usuario.lojaId}
          mesDefault={mesDefault}
        />
      </div>

      <SectionErrorBoundary key={`kpi-${filtroKey}`} label="os KPIs">
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection filtros={filtros} filtrosAnt={filtrosAnt} papel={usuario.papel} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`graficos-${filtroKey}`} label="os gráficos">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <GraficosSection filtros={filtros} isAdmin={isAdmin} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`ranking-${filtroKey}`} label="o ranking">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <RankingSection filtros={filtros} filtrosRanking={filtrosRanking} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`tabelas-${filtroKey}`} label="as tabelas">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <TabelasSection filtros={filtros} lojaId={filtros.lojaId} mecanicoId={mecanicoId} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  )
}
